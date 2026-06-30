package agent

import (
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/api"
	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/config"
	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/nftables"
	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/signing"
)

type Agent struct {
	cfg     *config.Config
	api     *api.Client
	nft     *nftables.Manager
}

func New(cfg *config.Config) (*Agent, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	apiClient := api.NewClient(cfg.AllowlistAPIURL, cfg.AgentToken)
	nftMgr := nftables.NewManager(cfg.NftTable, cfg.NftDbV4Set, cfg.NftDbV6Set, cfg.DryRun)

	if err := nftMgr.VerifyTableExists(); err != nil {
		return nil, fmt.Errorf("nftables verification failed: %w", err)
	}

	return &Agent{
		cfg: cfg,
		api: apiClient,
		nft: nftMgr,
	}, nil
}

func (a *Agent) Run() {
	ticker := time.NewTicker(time.Duration(a.cfg.ApplyIntervalSeconds) * time.Second)
	defer ticker.Stop()

	log.Printf("Firewall agent started (interval=%ds, dry_run=%v, fail_closed=%v)",
		a.cfg.ApplyIntervalSeconds, a.cfg.DryRun, a.cfg.FailClosed)

	a.cycle()

	for range ticker.C {
		a.cycle()
	}
}

func (a *Agent) cycle() {
	rawBody, fetchErr := a.api.FetchAllowlist()
	if fetchErr != nil {
		log.Printf("ERROR: failed to fetch allowlist: %v", fetchErr)
		if a.cfg.FailClosed {
			log.Printf("FAIL-CLOSED: flushing all nftables sets due to fetch failure")
			if err := a.nft.FailClosed(); err != nil {
				log.Printf("ERROR: fail-closed failed: %v", err)
			}
		}
		a.reportStatus("error", fetchErr.Error())
		return
	}

	ar, parseErr := a.api.ParseAllowlistResponse(rawBody)
	if parseErr != nil {
		log.Printf("ERROR: failed to parse allowlist response: %v", parseErr)
		if a.cfg.FailClosed {
			log.Printf("FAIL-CLOSED: flushing all nftables sets due to parse failure")
			if err := a.nft.FailClosed(); err != nil {
				log.Printf("ERROR: fail-closed failed: %v", err)
			}
		}
		a.reportStatus("error", parseErr.Error())
		return
	}

	sigErr := signing.VerifySignature(rawBody, ar.Signature, a.cfg.AppSigningSecret)
	if sigErr != nil {
		log.Printf("ERROR: signature verification failed: %v", sigErr)
		if a.cfg.FailClosed {
			log.Printf("FAIL-CLOSED: flushing all nftables sets due to signature failure")
			if err := a.nft.FailClosed(); err != nil {
				log.Printf("ERROR: fail-closed failed: %v", err)
			}
		}
		a.reportStatus("error", sigErr.Error())
		return
	}

	entries, validationErrs := validateEntries(ar.Entries)
	if len(validationErrs) > 0 {
		for _, e := range validationErrs {
			log.Printf("WARN: entry validation: %s", e)
		}
	}

	v4Count, v6Count, applyErr := a.nft.Apply(entries)
	if applyErr != nil {
		log.Printf("ERROR: nftables apply failed: %v", applyErr)
		if a.cfg.FailClosed {
			log.Printf("FAIL-CLOSED: flushing all nftables sets due to apply failure")
			if err := a.nft.FailClosed(); err != nil {
				log.Printf("ERROR: fail-closed failed: %v", err)
			}
		}
		a.reportStatus("error", applyErr.Error())
		return
	}

	log.Printf("Applied %d v4 entries and %d v6 entries to nftables", v4Count, v6Count)
	a.reportStatus("success", "")
}

func (a *Agent) reportStatus(status, errMsg string) {
	if err := a.api.ReportStatus(status, errMsg); err != nil {
		log.Printf("WARN: failed to report status: %v", err)
	}
}

func validateEntries(entries []api.AllowlistEntry) ([]nftables.Entry, []string) {
	var valid []nftables.Entry
	var warnings []string

	for _, e := range entries {
		ip := strings.Split(e.IPCidr, "/")[0]
		parsedIP := net.ParseIP(ip)
		if parsedIP == nil {
			warnings = append(warnings, fmt.Sprintf("skipping entry %s: invalid IP %s", e.ID, e.IPCidr))
			continue
		}

		version := 4
		if parsedIP.To4() == nil {
			version = 6
		}

		if version != e.IPVersion {
			warnings = append(warnings, fmt.Sprintf("entry %s: ipVersion mismatch (detected %d, got %d)", e.ID, version, e.IPVersion))
		}

		for _, port := range e.Ports {
			if port < 1 || port > 65535 {
				warnings = append(warnings, fmt.Sprintf("entry %s: invalid port %d", e.ID, port))
			}
		}

		var expiresAt *time.Time
		if e.ExpiresAt != nil && *e.ExpiresAt != "" {
			t, err := time.Parse(time.RFC3339, *e.ExpiresAt)
			if err != nil {
				t2, err2 := time.Parse("2006-01-02T15:04:05.000Z", *e.ExpiresAt)
				if err2 != nil {
					warnings = append(warnings, fmt.Sprintf("entry %s: invalid expiresAt format: %s", e.ID, *e.ExpiresAt))
				} else {
					expiresAt = &t2
				}
			} else {
				expiresAt = &t
			}

			if expiresAt != nil && time.Now().After(*expiresAt) {
				continue
			}
		}

		valid = append(valid, nftables.Entry{
			IPCidr:    e.IPCidr,
			IPVersion: version,
			Ports:     e.Ports,
			ExpiresAt: expiresAt,
		})
	}

	return valid, warnings
}

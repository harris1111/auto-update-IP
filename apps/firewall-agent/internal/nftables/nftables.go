package nftables

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type Entry struct {
	IPCidr    string
	IPVersion int
	Ports     []int
	ExpiresAt *time.Time
}

type Manager struct {
	table  string
	v4Set  string
	v6Set  string
	dryRun bool
}

func NewManager(table, v4Set, v6Set string, dryRun bool) *Manager {
	return &Manager{
		table:  table,
		v4Set:  v4Set,
		v6Set:  v6Set,
		dryRun: dryRun,
	}
}

func (m *Manager) Apply(entries []Entry) (int, int, error) {
	var v4Cmds, v6Cmds []string

	for _, entry := range entries {
		setName := m.v4Set
		if entry.IPVersion == 6 {
			setName = m.v6Set
		}

		element := entry.IPCidr
		if entry.ExpiresAt != nil {
			remaining := time.Until(*entry.ExpiresAt)
			if remaining <= 0 {
				continue
			}
			seconds := int64(remaining.Seconds())
			element = fmt.Sprintf("%s timeout %ds", element, seconds)
		}

		cmd := fmt.Sprintf("add element inet %s %s { %s }", m.table, setName, element)
		if entry.IPVersion == 6 {
			v6Cmds = append(v6Cmds, cmd)
		} else {
			v4Cmds = append(v4Cmds, cmd)
		}
	}

	if m.dryRun {
		fmt.Printf("[DRY RUN] Would flush and add %d v4 entries, %d v6 entries to nftables\n", len(v4Cmds), len(v6Cmds))
		for _, cmd := range v4Cmds {
			fmt.Printf("[DRY RUN]   %s\n", cmd)
		}
		for _, cmd := range v6Cmds {
			fmt.Printf("[DRY RUN]   %s\n", cmd)
		}
		return len(v4Cmds), len(v6Cmds), nil
	}

	var nftInput strings.Builder
	nftInput.WriteString(fmt.Sprintf("flush set inet %s %s\n", m.table, m.v4Set))
	nftInput.WriteString(fmt.Sprintf("flush set inet %s %s\n", m.table, m.v6Set))

	for _, cmd := range v4Cmds {
		nftInput.WriteString(cmd + "\n")
	}
	for _, cmd := range v6Cmds {
		nftInput.WriteString(cmd + "\n")
	}

	cmd := exec.Command("nft", "-f", "-")
	cmd.Stdin = strings.NewReader(nftInput.String())

	output, err := cmd.CombinedOutput()
	if err != nil {
		return 0, 0, fmt.Errorf("nftables apply failed: %w\nOutput: %s", err, string(output))
	}

	return len(v4Cmds), len(v6Cmds), nil
}

func (m *Manager) FailClosed() error {
	if m.dryRun {
		fmt.Printf("[DRY RUN] Would flush sets for fail-closed\n")
		return nil
	}

	var nftInput strings.Builder
	nftInput.WriteString(fmt.Sprintf("flush set inet %s %s\n", m.table, m.v4Set))
	nftInput.WriteString(fmt.Sprintf("flush set inet %s %s\n", m.table, m.v6Set))

	cmd := exec.Command("nft", "-f", "-")
	cmd.Stdin = strings.NewReader(nftInput.String())

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("fail-closed nftables flush failed: %w\nOutput: %s", err, string(output))
	}

	return nil
}

func (m *Manager) VerifyTableExists() error {
	if m.dryRun {
		return nil
	}

	cmd := exec.Command("nft", "list", "table", "inet", m.table)
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("nftables table 'inet %s' does not exist: %w", m.table, err)
	}
	return nil
}

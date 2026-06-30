# Secure Just-in-Time Firewall Allowlist Gateway (update.0err.com)

A secure JIT firewall allowlist management system designed for shared development servers. Exposes local resources (PostgreSQL, MongoDB, MinIO) safely via Nginx TCP stream proxies, protected dynamically with `nftables` source-IP sets.

## Repository Structure

```text
auto-update-IP/
├── apps/
│   ├── web/                     # Next.js Fullstack Web App (TypeScript)
│   └── firewall-agent/          # Go Daemon Agent (nftables elements synchronizer)
├── infra/
│   ├── compose.dev.yml          # Dev services (Postgres, Redis, Mailhog)
│   ├── nginx/                   # Nginx TCP stream configurations
│   ├── nftables/                # Base ruleset table and sets definitions
│   └── systemd/                 # firewall-agent production systemd unit
├── docs/                        # Specifications, Threats, Runbook, Deploy guides
│   ├── api.md
│   ├── deployment.md
│   ├── runbook.md
│   ├── testing.md
│   └── threat-model.md
├── scripts/                     # Helper dev and validation scripts
└── README.md
```

## Technology Stack

- **Web App**: Next.js (App Router), TypeScript, Prisma Client, PostgreSQL, Redis, simplewebauthn, jose, nodemailer.
- **Firewall Agent**: Go, nftables (system `nft` CLI execution).
- **Enforcement Layer**: Nginx stream, nftables sets (`db_allow_v4` and `db_allow_v6` in `inet shared_dedi`).

## Documentation Links

- **Threat Model**: [threat-model.md](file:///g:/Dev/Repos-Windows/auto-update-IP/docs/threat-model.md) - Security risk analysis and mitigations.
- **Operations Runbook**: [runbook.md](file:///g:/Dev/Repos-Windows/auto-update-IP/docs/runbook.md) - Admin guides, emergency commands, secret rotation.
- **Deployment Guide**: [deployment.md](file:///g:/Dev/Repos-Windows/auto-update-IP/docs/deployment.md) - Step-by-step production deployment instructions.
- **API Spec**: [api.md](file:///g:/Dev/Repos-Windows/auto-update-IP/docs/api.md) - REST API endpoint definitions.
- **Testing Guide**: [testing.md](file:///g:/Dev/Repos-Windows/auto-update-IP/docs/testing.md) - Guide to run unit, integration, E2E, and Go tests.

## Running Tests

Run the full project tests:
```bash
# Vitest unit + integration tests
pnpm test

# Playwright E2E browser tests
pnpm test:e2e

# Go agent package tests
cd apps/firewall-agent && go test ./...
```

# update.0err.com — TDD Specification

## 1. Goal

Build `update.0err.com`, a secure Just-in-Time firewall allowlist app for a shared development server.

The app lets an authenticated admin manage which public IPs may access selected development infrastructure gateway ports. The real services remain bound to `127.0.0.1`; public access is exposed only through Nginx stream TCP gateway ports and blocked by default with `nftables`.

The project must be implemented with Test Driven Development.

## 2. Final Stack

```text
Web app:
- Next.js full-stack
- TypeScript
- Prisma
- PostgreSQL
- Redis
- Vitest
- Playwright

Firewall agent:
- Go

TCP gateway:
- Nginx stream

Firewall:
- nftables
```

## 3. Architecture

```text
Browser
  -> https://update.0err.com
  -> Cloudflare Zero Trust / Access
  -> Next.js app auth
  -> passkey or OTP step-up
  -> PostgreSQL allowlist state
  -> Redis short-lived auth/cache/rate-limit state

Go firewall-agent
  -> pulls signed allowlist from update.0err.com
  -> verifies machine token + HMAC signature
  -> validates payload
  -> applies nftables rules

Native DB client
  -> SERVER_PUBLIC_IP:15432 / 27017 / 19000
  -> nftables source-IP check
  -> Nginx stream gateway
  -> 127.0.0.1 database/service
```

## 4. Core User Flow

1. Admin opens `update.0err.com`.
2. Cloudflare Zero Trust verifies the request.
3. App auth/session verifies the admin.
4. Admin chooses `Allow current IP`.
5. Admin selects port groups: PostgreSQL, MongoDB, MinIO, or all safe services.
6. Admin chooses TTL or Persistent mode.
7. Admin confirms with passkey or OTP fallback.
8. App stores the allowlist entry in PostgreSQL and writes audit log.
9. Go firewall-agent pulls signed allowlist.
10. Agent verifies signature and applies nftables rules.
11. Admin connects native DB client to `SERVER_PUBLIC_IP:PORT`.

## 5. Hard Decisions Already Chosen

### 5.1 TTL and Persistent Entries

Each allowlist entry supports either:

```text
Temporary:
- Has expires_at.
- Firewall rule expires automatically.

Persistent:
- No expires_at.
- Stays active until manually revoked/deleted.
- Must be clearly labelled in UI.
```

UI options:

```text
30 minutes
2 hours
8 hours
24 hours
Custom expiry
Persistent
```

### 5.2 Step-Up Auth

All whitelist CRUD actions require step-up auth.

Default:

```text
Passkey / WebAuthn
```

Fallback:

```text
OTP sent to a backend-configured admin email.
```

The admin email must never be shown in UI or API responses.

Allowed copy:

```text
OTP sent to the configured admin mailbox.
```

### 5.3 Public TCP Access

The raw DB access path must be public `SERVER_IP:PORT`, not Cloudflare Tunnel, SSH tunnel, VPN, Tailscale, or WireGuard.

Cloudflare protects only the web app, not raw TCP database ports.

### 5.4 Redis Exposure

Redis must not be publicly exposed by default.

## 6. Network Model

Real services bind localhost only:

```text
PostgreSQL: 127.0.0.1:5432
MongoDB:    127.0.0.1:27017
MinIO API:  127.0.0.1:9000
Redis:      127.0.0.1:6379
```

Nginx stream exposes public gateway ports:

```text
SERVER_PUBLIC_IP:15432 -> 127.0.0.1:5432   PostgreSQL
SERVER_PUBLIC_IP:27017 -> 127.0.0.1:27017  MongoDB
SERVER_PUBLIC_IP:19000 -> 127.0.0.1:9000   MinIO API
```

No public Redis gateway by default.

## 7. Nginx Stream Role

Nginx stream is the TCP gateway. It does not authenticate users; it forwards TCP traffic from public gateway ports to local-only services.

Database/service authentication still happens in:

```text
PostgreSQL user/password
MongoDB user/password
MinIO access key/secret
```

Conceptual config:

```nginx
stream {
    log_format db_gateway '$remote_addr [$time_local] '
                          '$protocol $status $bytes_sent $bytes_received '
                          '$session_time "$upstream_addr"';

    access_log /var/log/nginx/db-gateway-access.log db_gateway;
    error_log  /var/log/nginx/db-gateway-error.log warn;

    server {
        listen 15432;
        proxy_pass 127.0.0.1:5432;
        proxy_connect_timeout 5s;
        proxy_timeout 1h;
    }

    server {
        listen 27017;
        proxy_pass 127.0.0.1:27017;
        proxy_connect_timeout 5s;
        proxy_timeout 1h;
    }

    server {
        listen 19000;
        proxy_pass 127.0.0.1:9000;
        proxy_connect_timeout 5s;
        proxy_timeout 1h;
    }
}
```

Implementation must check stream support:

```bash
nginx -V 2>&1 | grep -o with-stream || true
sudo nginx -t
sudo systemctl reload nginx
```

On Debian, stream support may require:

```bash
sudo apt install libnginx-mod-stream
```

## 8. nftables Role

`nftables` is the enforcement layer.

Requirements:

- Drop non-whitelisted traffic to gateway ports.
- Allow only approved IPs/CIDRs.
- Support temporary entries with timeout.
- Support persistent entries.
- Never flush unrelated firewall rules.
- Never apply invalid payloads.
- Fail closed.

Conceptual table:

```nft
table inet shared_dedi {
  set db_allow_v4 {
    type ipv4_addr
    flags timeout
  }

  set db_allow_v6 {
    type ipv6_addr
    flags timeout
  }

  chain input {
    type filter hook input priority 0; policy accept;

    ct state established,related accept
    iif lo accept

    tcp dport {15432, 27017, 19000} ip saddr @db_allow_v4 accept
    tcp dport {15432, 27017, 19000} ip6 saddr @db_allow_v6 accept

    tcp dport {15432, 27017, 19000} drop
  }
}
```

If CIDR ranges are supported, use interval sets and test them carefully.

## 9. Authentication Model

Two layers:

```text
Layer 1: Cloudflare Zero Trust / Access
Layer 2: App session/auth
```

Supported app login:

```text
- Google/OIDC, or
- trusted Cloudflare Access identity after verifying Access JWT
```

The app must not trust arbitrary identity headers unless Cloudflare Access JWT verification succeeds.

Before allowlist mutation, require step-up:

```text
Passkey first
OTP fallback
```

## 10. OTP Requirements

OTP is only fallback step-up auth.

Requirements:

- Sent only to `ADMIN_EMAIL` from backend environment.
- UI/API never reveals `ADMIN_EMAIL`.
- Bound to exact action payload.
- Short-lived.
- Single-use.
- Max attempts.
- Stored hashed, never plaintext.
- Rate-limited.

Recommended defaults:

```text
OTP length: 6-8 digits
OTP TTL: 5 minutes
Max attempts: 5
Resend cooldown: 60 seconds
Max resend: 3 per 15 minutes
```

OTP challenge must bind:

```json
{
  "action": "allowlist.create",
  "payloadHash": "sha256-of-canonical-action-payload",
  "userId": "uuid",
  "sessionId": "session-id"
}
```

## 11. Passkey Requirements

Passkey/WebAuthn is the default step-up method.

Requirements:

- User must enroll at least one passkey before CRUD.
- Challenge is short-lived.
- Challenge is tied to user/session/action.
- Verify credential ID, origin, RP ID, challenge, and counter.
- Store credential public key and counter.
- Support multiple passkeys if practical.
- OTP remains recovery/fallback.

Recommended RP values:

```env
PASSKEY_RP_ID=update.0err.com
PASSKEY_RP_NAME=0ERR Firewall Update
PASSKEY_ORIGIN=https://update.0err.com
```

## 12. Environment Variables

### Web App

```env
APP_BASE_URL=https://update.0err.com
NODE_ENV=production

DATABASE_URL=postgresql://...
REDIS_URL=redis://...

SESSION_SECRET=
APP_SIGNING_SECRET=

ADMIN_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

CLOUDFLARE_ACCESS_AUD=
CLOUDFLARE_ACCESS_TEAM_DOMAIN=
CLOUDFLARE_ACCESS_JWKS_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

PASSKEY_RP_ID=update.0err.com
PASSKEY_RP_NAME=0ERR Firewall Update
PASSKEY_ORIGIN=https://update.0err.com

DEFAULT_TTL_MINUTES=120
MAX_TEMP_TTL_HOURS=24
ALLOW_PERSISTENT_ENTRIES=true

TRUST_CF_CONNECTING_IP=true
```

### Firewall Agent

```env
ALLOWLIST_API_URL=https://update.0err.com/api/agent/allowlist
AGENT_TOKEN=
APP_SIGNING_SECRET=
NFT_TABLE=shared_dedi
NFT_DB_V4_SET=db_allow_v4
NFT_DB_V6_SET=db_allow_v6
APPLY_INTERVAL_SECONDS=15
FAIL_CLOSED=true
DRY_RUN=false
```

## 13. Repository Structure

```text
update-allowlist/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── prisma/
│   │   ├── tests/
│   │   ├── playwright.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── firewall-agent/
│       ├── cmd/
│       │   └── firewall-agent/
│       ├── internal/
│       │   ├── allowlist/
│       │   ├── config/
│       │   ├── nftables/
│       │   └── signing/
│       ├── tests/
│       └── go.mod
├── infra/
│   ├── compose.dev.yml
│   ├── nginx/
│   │   └── db-gateway.stream.conf
│   ├── nftables/
│   │   └── shared-dedi.nft
│   └── systemd/
│       └── firewall-agent.service
├── docs/
│   ├── api.md
│   ├── deployment.md
│   ├── runbook.md
│   ├── testing.md
│   └── threat-model.md
├── scripts/
│   ├── dev.sh
│   ├── generate-secrets.sh
│   ├── migrate.sh
│   ├── test.sh
│   └── validate.sh
└── README.md
```

## 14. Data Model

Use Prisma migrations.

### User

```text
users
- id uuid primary key
- email_hash text not null
- display_name text nullable
- provider text not null
- provider_subject text not null
- role text not null default 'admin'
- passkey_required boolean not null default true
- passkey_enrolled boolean not null default false
- created_at timestamp
- updated_at timestamp
- last_login_at timestamp nullable
```

### Passkey Credential

```text
passkey_credentials
- id uuid primary key
- user_id uuid references users(id)
- credential_id text unique not null
- public_key text not null
- counter bigint not null default 0
- transports jsonb nullable
- name text nullable
- created_at timestamp
- last_used_at timestamp nullable
```

### OTP Challenge

```text
otp_challenges
- id uuid primary key
- user_id uuid references users(id)
- action text not null
- action_payload_hash text not null
- otp_hash text not null
- expires_at timestamp not null
- consumed_at timestamp nullable
- attempts integer not null default 0
- max_attempts integer not null default 5
- created_at timestamp
```

### Port Group

```text
port_groups
- id uuid primary key
- key text unique not null
- name text not null
- description text nullable
- ports integer[] not null
- enabled boolean not null default true
- public_exposure_allowed boolean not null default true
- created_at timestamp
- updated_at timestamp
```

Default groups:

```text
postgres: [15432]
mongo:    [27017]
minio:    [19000]
all_safe: [15432, 27017, 19000]
```

Do not create Redis public port group by default.

### Allowlist Entry

```text
allowlist_entries
- id uuid primary key
- ip_cidr text not null
- ip_version integer not null
- label text not null
- reason text nullable
- port_group_ids uuid[] not null
- ports integer[] not null
- is_persistent boolean not null default false
- expires_at timestamp nullable
- enabled boolean not null default true
- created_by uuid references users(id)
- updated_by uuid references users(id)
- created_at timestamp
- updated_at timestamp
- last_applied_at timestamp nullable
```

Validation:

```text
- ip_cidr must be valid IPv4/IPv6 CIDR.
- Single IPv4 normalizes to /32.
- Single IPv6 normalizes to /128.
- Temporary entries require expires_at.
- Persistent entries require expires_at = null.
- Ports must come from enabled port groups.
- Redis port 6379 must be rejected by default.
```

### Audit Log

```text
audit_logs
- id uuid primary key
- actor_user_id uuid nullable
- action text not null
- resource_type text not null
- resource_id uuid nullable
- ip text nullable
- user_agent_hash text nullable
- metadata jsonb not null default '{}'
- created_at timestamp
```

Audit actions:

```text
login_success
login_failed
passkey_enrolled
passkey_used
otp_requested
otp_verified
otp_failed
allowlist_created
allowlist_updated
allowlist_deleted
allowlist_revoked
allowlist_revoke_all
agent_allowlist_fetched
agent_report_success
agent_report_failed
```

### Agent Token

```text
agent_tokens
- id uuid primary key
- name text not null
- token_hash text not null
- enabled boolean not null default true
- last_used_at timestamp nullable
- created_at timestamp
```

## 15. API Specification

All APIs return JSON.

### Auth APIs

```text
GET  /api/auth/me
POST /api/auth/logout
POST /api/auth/passkey/register/options
POST /api/auth/passkey/register/verify
POST /api/auth/passkey/authenticate/options
POST /api/auth/passkey/authenticate/verify
```

### Step-Up APIs

```text
POST /api/step-up/otp/request
POST /api/step-up/otp/verify
POST /api/step-up/passkey/options
POST /api/step-up/passkey/verify
```

OTP response:

```json
{
  "ok": true,
  "message": "OTP sent to the configured admin mailbox."
}
```

### Current IP API

```text
GET /api/current-ip
```

Response:

```json
{
  "ip": "1.2.3.4",
  "ipVersion": 4,
  "source": "cf-connecting-ip"
}
```

Rules:

- Use `CF-Connecting-IP` only if Cloudflare Access/JWT is verified or origin is unreachable directly.
- Do not trust arbitrary `X-Forwarded-For` in production.
- Local dev may use remote socket address.

### Port Groups API

```text
GET /api/port-groups
```

### Allowlist APIs

```text
GET    /api/allowlist
POST   /api/allowlist
GET    /api/allowlist/:id
PATCH  /api/allowlist/:id
DELETE /api/allowlist/:id
POST   /api/allowlist/:id/revoke
POST   /api/allowlist/revoke-all
```

All mutation APIs require step-up token.

Temporary payload:

```json
{
  "ipCidr": "1.2.3.4/32",
  "label": "Company laptop",
  "reason": "Development session",
  "portGroupKeys": ["postgres", "mongo"],
  "mode": "temporary",
  "ttlMinutes": 120
}
```

Persistent payload:

```json
{
  "ipCidr": "1.2.3.4/32",
  "label": "Home static IP",
  "reason": "Trusted static IP",
  "portGroupKeys": ["postgres", "mongo", "minio"],
  "mode": "persistent"
}
```

### Firewall Agent APIs

```text
GET  /api/agent/allowlist
POST /api/agent/report
```

`GET /api/agent/allowlist` requires bearer machine token.

Response:

```json
{
  "generatedAt": "2026-06-29T00:00:00Z",
  "version": 12,
  "entries": [
    {
      "id": "uuid",
      "ipCidr": "1.2.3.4/32",
      "ipVersion": 4,
      "ports": [15432, 27017],
      "mode": "temporary",
      "expiresAt": "2026-06-29T02:00:00Z"
    },
    {
      "id": "uuid",
      "ipCidr": "5.6.7.8/32",
      "ipVersion": 4,
      "ports": [15432],
      "mode": "persistent",
      "expiresAt": null
    }
  ],
  "signature": "base64-hmac-sha256"
}
```

Signature:

- Canonical JSON excluding `signature`.
- HMAC-SHA256 with `APP_SIGNING_SECRET`.
- Agent rejects tampered payload.

## 16. UI Specification

Pages:

```text
/login
/setup-passkey
/dashboard
/allowlist
/allowlist/new
/allowlist/:id
/audit
/settings
```

Dashboard must show:

```text
current detected IP
quick action: allow current IP
active temporary entries
persistent entries
expired entries
disabled entries
last firewall-agent sync
warning if firewall-agent is stale
```

Allowlist table columns:

```text
Status
IP/CIDR
Label
Ports
Mode
Expires At
Created By
Last Updated
Actions
```

Create/edit form fields:

```text
IP/CIDR
Use current IP
Label
Reason
Port groups
Mode: temporary/persistent
TTL selector if temporary
```

Mutation flow:

```text
Open step-up modal
Prefer passkey
Allow OTP fallback
Do not show admin email
```

## 17. Go Firewall-Agent Specification

Responsibilities:

```text
Load config from env/file.
Fetch signed allowlist periodically.
Authenticate with bearer token.
Verify HMAC signature.
Validate all entries.
Ignore expired entries.
Apply nftables rules.
Support dry-run mode.
Report success/failure to app.
Fail closed on invalid payload.
Never print secrets.
Never flush unrelated firewall rules.
```

Modes:

```text
dry-run:
- fetch allowlist
- verify signature
- generate nftables commands
- do not apply

apply:
- fetch allowlist
- verify signature
- apply nftables changes
```

Allowed table and sets:

```text
inet shared_dedi
db_allow_v4
db_allow_v6
```

Allowed ports:

```text
15432
27017
19000
```

Validation before apply:

```text
signature is valid
machine token accepted
IP/CIDR valid
ports allowed
Redis port rejected
expired temporary entries ignored
persistent entries explicitly marked
payload schema valid
```

## 18. TDD Requirements

Implementation must be test-first.

### Root Commands

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
go test ./...
./scripts/test.sh
```

### Unit Tests

Cover:

```text
IP parsing and normalization
IPv4/IPv6 detection
CIDR validation
TTL calculation
persistent entry validation
port group resolution
Redis port rejection
action payload hashing
OTP generation
OTP hashing
OTP expiry
OTP attempt limit
passkey challenge lifecycle
audit log payload creation
signed allowlist canonicalization
HMAC signing and verification
current IP extraction
permission checks
rate-limit key generation
```

### Integration Tests

Use test Postgres and Redis.

Cover:

```text
create temporary allowlist entry
create persistent allowlist entry
reject temporary entry without expiry
reject persistent entry with expiry
reject arbitrary disallowed port
reject Redis public port
require step-up for create/update/delete/revoke
read allowlist without step-up after login
OTP request stores hashed challenge
OTP verify consumes challenge
OTP cannot be reused
expired OTP fails
too many OTP attempts fails
audit logs are written
agent allowlist returns only active enabled entries
expired entries are omitted
disabled entries are omitted
machine token required
allowlist signature valid
```

### API Security Tests

Cover:

```text
unauthenticated users cannot access protected APIs
non-enrolled users cannot mutate allowlist
mutation without step-up fails
invalid step-up token fails
wrong payload hash fails
OTP response never exposes admin email
X-Forwarded-For spoofing does not override IP in production
invalid Cloudflare Access JWT fails
missing machine token fails agent API
invalid machine token fails agent API
tampered allowlist response fails agent validation
```

### Playwright E2E Tests

Critical UI flows only:

```text
login flow mock
passkey enrollment mock
dashboard shows current IP
create temporary entry with passkey
create persistent entry with passkey
create entry with OTP fallback
edit entry requires step-up
delete entry requires step-up
revoke entry requires step-up
revoke all requires step-up
OTP UI never shows admin email
persistent entries are clearly labelled
expired entries are clearly labelled
audit page shows recent actions
```

### Go Firewall-Agent Tests

Cover:

```text
parse valid signed allowlist
reject invalid signature
reject unknown port
reject Redis port
ignore expired temporary entries
handle persistent entries
generate expected nft commands
avoid flushing unrelated tables
fail closed on invalid payload
report apply success
report apply failure
handle app API unavailable without opening firewall
support dry-run mode
```

## 19. Local Dev Compose

Create `infra/compose.dev.yml` with:

```text
web
postgres
redis
mailhog
```

Optional:

```text
mock-agent
```

Dev mode must not require real Cloudflare Access.

Use mock auth only in local/test mode.

## 20. Deployment Target

Production path:

```text
/home/debian/infra/update-allowlist
```

Production components:

```text
update-web
update-postgres
update-redis
firewall-agent
Nginx stream config
nftables rules
```

Web URL:

```text
https://update.0err.com
```

Raw DB access:

```text
SERVER_PUBLIC_IP:15432
SERVER_PUBLIC_IP:27017
SERVER_PUBLIC_IP:19000
```

Raw DB ports are not proxied by Cloudflare.

## 21. Security Requirements

Must satisfy:

```text
No secrets committed.
No ADMIN_EMAIL shown.
No Redis public port.
No direct Docker public DB port.
No UFW-only assumption.
No full firewall flush.
No unrelated nftables changes.
No mutation without step-up auth.
No allowlist payload accepted without signature.
No agent access without machine token.
No trust in spoofed X-Forwarded-For.
No password/OTP plaintext storage.
```

## 22. Threat Model Docs

Create `docs/threat-model.md`.

Must cover:

```text
attacker guesses DB gateway port
shared NAT public IP risk
stale persistent whitelist entries
compromised admin session
compromised admin email
lost passkey
leaked agent token
tampered allowlist payload
spoofed X-Forwarded-For
direct origin access
Cloudflare Access misconfiguration
Redis exposure risk
Docker port publishing pitfalls
bad nftables rule
firewall-agent unavailable
```

## 23. Runbook Docs

Create `docs/runbook.md`.

Must cover:

```text
deploy web app
run migrations
configure SMTP
configure Cloudflare Access
enroll passkey
request OTP fallback
create temporary allow
create persistent allow
revoke one entry
revoke all entries
inspect audit logs
inspect last agent sync
test Nginx stream config
reload Nginx
inspect nftables rules
manual emergency firewall close
restart firewall-agent
rotate secrets
disable all gateway ports
recover from bad firewall rule
```

Emergency close commands:

```bash
sudo nft flush set inet shared_dedi db_allow_v4
sudo nft flush set inet shared_dedi db_allow_v6
```

Do not document commands that flush the whole firewall.

## 24. Implementation Order

### Stage 0: Skeleton

```text
Create monorepo.
Create Next.js app.
Create Go firewall-agent skeleton.
Create dev compose with Postgres, Redis, Mailhog.
Add lint/test/build scripts.
```

Success:

```text
pnpm test passes
go test ./... passes
docker compose -f infra/compose.dev.yml up works
```

### Stage 1: Data Model and Validators

Write tests first for:

```text
IP validation
TTL validation
persistent validation
port group validation
Redis port rejection
```

Then implement Prisma schema and validators.

### Stage 2: Auth and Step-Up

Write tests first for:

```text
session auth
passkey challenge lifecycle
OTP lifecycle
mutation requires step-up
```

Then implement auth/passkey/OTP.

### Stage 3: Allowlist CRUD

Write tests first for:

```text
create
edit
delete
revoke
revoke all
audit
current IP detection
```

Then implement APIs and UI.

### Stage 4: Agent API and Signing

Write tests first for:

```text
machine token required
signed allowlist
tamper rejection
active entries only
```

Then implement agent API.

### Stage 5: Go Agent Dry-Run

Write tests first for:

```text
fetch
verify
validate
generate nft commands
fail closed
```

Then implement dry-run.

### Stage 6: Real nftables and Nginx Integration

Tasks:

```text
install/check Nginx stream
write Nginx stream config
write nftables setup
implement apply mode
add systemd unit
```

Do not break SSH or unrelated firewall rules.

### Stage 7: Docs and Final Report

Run all tests and produce final report.

## 25. Acceptance Criteria

Success only if:

```text
1. Next.js app runs locally.
2. PostgreSQL and Redis work.
3. Prisma migrations work.
4. Production build succeeds.
5. Vitest unit tests pass.
6. Integration tests pass.
7. Playwright critical E2E tests pass.
8. Go firewall-agent tests pass.
9. Allowlist CRUD requires passkey or OTP.
10. OTP email target is never shown.
11. Temporary TTL entries work.
12. Persistent entries work.
13. Redis public port is rejected by default.
14. Agent API requires machine token.
15. Agent allowlist response is signed.
16. Agent rejects tampered payload.
17. Agent dry-run generates expected nftables commands.
18. Nginx stream config is documented and validated.
19. nftables rules are documented and validated.
20. Audit log records security-sensitive actions.
21. Deployment docs target /home/debian/infra/update-allowlist.
22. No secret values are printed in reports.
```

## 26. Final Report Format

At the end of implementation, produce:

```markdown
# update.0err.com Implementation Report

## 1. Summary

Succeeded / partially succeeded / failed.

## 2. Architecture

Explain:
- Next.js web app
- PostgreSQL
- Redis
- Go firewall-agent
- Nginx stream
- nftables

## 3. Files Created

List important files.

## 4. Tests

Include commands and results:
- pnpm test
- pnpm test:integration
- pnpm test:e2e
- pnpm build
- go test ./...
- ./scripts/validate.sh

## 5. Security Features

List implemented controls.

## 6. API Endpoints

List key endpoints.

## 7. UI Pages

List implemented pages.

## 8. Firewall Agent

Explain:
- dry-run mode
- apply mode
- signature verification
- fail-closed behavior

## 9. Nginx Stream Gateway

Explain:
- public ports
- local backend ports
- config path
- validation command

## 10. nftables Rules

Explain:
- table
- sets
- ports
- temporary vs persistent behavior
- emergency revoke commands

## 11. Deployment Instructions

Explain local dev and production deployment to:
/home/debian/infra/update-allowlist

## 12. Known Limitations

State incomplete or intentionally unsupported features.

## 13. Next Steps

Recommend improvements.
```

Do not include secret values.

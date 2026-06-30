# Operations Runbook — update.0err.com Allowlist Gateway

This document provides operational instructions for managing and troubleshooting the allowlist gateway system.

## 1. Local Development & Deployment

### 1.1 Start Dev Environment
Spin up local database, cache, and SMTP test servers:
```bash
docker compose -f infra/compose.dev.yml up -d
```

Run Next.js in development mode:
```bash
pnpm --filter web dev -p 5000 -H 127.0.0.1
```

Run Go Firewall-Agent in dry-run mode:
```bash
$env:AGENT_TOKEN="env-default"; $env:APP_SIGNING_SECRET="fallback-signing-secret-key-at-least-32-chars"; go run ./apps/firewall-agent/cmd/firewall-agent/main.go
```

### 1.2 Running Production Build & Database Migrations
Deploy files to `/home/debian/infra/update-allowlist` and execute:
```bash
# Web server
cd /home/debian/infra/update-allowlist/apps/web
pnpm install
npx prisma migrate deploy
pnpm build
pm2 restart update-web || pm2 start npm --name "update-web" -- start

# Go firewall agent
cd /home/debian/infra/update-allowlist/apps/firewall-agent
go build -o firewall-agent ./cmd/firewall-agent
sudo systemctl restart firewall-agent
```

## 2. Authentication & Administration

### 2.1 Enroll a Passkey
1. Log in to `/login` using the Instant Access or OIDC option.
2. Navigate to **Settings** (`/settings`).
3. Under **Registered Passkeys**, enter a label for the passkey and click **Enroll Passkey**.
4. Complete the browser's WebAuthn prompt.

### 2.2 OTP Fallback Verification
If the passkey device is unavailable, click **Request fallback OTP Email** on the step-up prompt.
- The OTP is sent to the address configured in `ADMIN_EMAIL`.
- The code is valid for 5 minutes and is rate-limited to 5 attempts.
- In local development, check the terminal logs of the Next.js process or Mailhog dashboard (`http://localhost:8025`) to retrieve the code.

## 3. Allowlist Operations

### 3.1 Create Temporary Allow
- Click **Allow Current IP** on the Dashboard for a quick 2-hour lease.
- To customize, click **Add Custom Rule** and fill out the IP address, label, ports, and lease TTL. Confirm with step-up verification.

### 3.2 Revoke Rules
- **Revoke One**: Click **Revoke** next to any active entry in the dashboard.
- **Revoke All (Emergency)**: Click the red **Emergency Close (Revoke All)** button on the dashboard to immediately block all dynamic access.

## 4. Firewall & Gateway Troubleshooting

### 4.1 Test Nginx Stream Configuration
Ensure Nginx is proxying traffic correctly and configurations are valid:
```bash
sudo nginx -t
```
Reload Nginx to apply stream configuration:
```bash
sudo systemctl reload nginx
```

### 4.2 Inspect nftables State
List the active dynamic IP rules in the sets:
```bash
sudo nft list table inet shared_dedi
```

### 4.3 Manual Emergency Firewall Close
If the web application or agent is completely unresponsive, clear the allowed IP sets manually on the host:
```bash
sudo nft flush set inet shared_dedi db_allow_v4
sudo nft flush set inet shared_dedi db_allow_v6
```
*Note: Do not flush the entire firewall table (`nft flush table`), as it may disrupt SSH or other system services.*

### 4.4 Rotate Secrets
If `APP_SIGNING_SECRET` or database credentials leak, update the environment files:
1. Update `.env` inside `/home/debian/infra/update-allowlist/apps/web/` and `/home/debian/infra/update-allowlist/apps/firewall-agent/`.
2. Restart the web server and the agent daemon:
   ```bash
   pm2 restart update-web
   sudo systemctl restart firewall-agent
   ```

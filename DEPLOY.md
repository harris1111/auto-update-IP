# Deployment Guide — update.0err.com Allowlist Gateway

## Prerequisites

Debian/Ubuntu server with:
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nftables nginx libnginx-mod-stream curl git golang
```

## Quick Deploy (Docker Compose)

```bash
git clone git@github.com:harris1111/auto-update-IP.git /opt/update-allowlist
cd /opt/update-allowlist

cp .env.example .env
# Edit .env with your secrets, SMTP credentials, and ADMIN_EMAIL

chmod 600 .env
docker compose up -d --build
```

The web app will be on `http://127.0.0.1:52118`. Reverse-proxy it with nginx.

## Nginx Reverse Proxy

Create `/etc/nginx/sites-enabled/update.0err.com`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name update.0err.com;

    location / {
        proxy_pass http://127.0.0.1:52118;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Nginx Stream Proxy (DB Gateway)

Add to the top level of `/etc/nginx/nginx.conf` (after the `http {}` block):
```nginx
include /opt/update-allowlist/infra/nginx/db-gateway.stream.conf;
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## nftables Firewall

```bash
sudo nft -f /opt/update-allowlist/infra/nftables/shared-dedi.nft
```

## Firewall Agent (systemd)

```bash
# Build the agent
cd /opt/update-allowlist/apps/firewall-agent
go build -o firewall-agent ./cmd/firewall-agent

# Set DRY_RUN=false when ready for production
cp .env.example.firewall .env
# Edit .env with AGENT_TOKEN and APP_SIGNING_SECRET matching the web .env

# Install and start
sudo cp /opt/update-allowlist/infra/systemd/firewall-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now firewall-agent
```

## First Login

1. Visit `http://update.0err.com`
2. Enter the email set in `ADMIN_EMAIL` (.env)
3. Click "Send OTP Login Code"
4. Check email for the 6-digit code
5. Verify the code, then enroll a passkey
6. Use passkey for future logins

## Updating

```bash
cd /opt/update-allowlist
git pull
docker compose up -d --build web
cd apps/firewall-agent && go build -o firewall-agent ./cmd/firewall-agent
sudo systemctl restart firewall-agent
```

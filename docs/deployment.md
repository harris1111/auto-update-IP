# Deployment Guide — update.0err.com Allowlist Gateway

This document outlines the steps to deploy the web application, databases, and firewall agent to the production environment on the Debian server at `/home/debian/infra/update-allowlist`.

## 1. Prerequisites

Ensure the following system packages are installed on the Debian server:
```bash
sudo apt update
sudo apt install -y curl git nginx libnginx-mod-stream nftables nodejs npm golang
```

Install `pnpm` globally:
```bash
sudo npm install -g pnpm
```

## 2. Directory Layout

Set up the deploy directory:
```bash
sudo mkdir -p /home/debian/infra/update-allowlist
sudo chown -R debian:debian /home/debian/infra/update-allowlist
```

The repository files should be cloned or copied to `/home/debian/infra/update-allowlist/`.

## 3. Database & Redis Setup

In production, run PostgreSQL and Redis services on localhost or bind them locally. If running via Docker Compose:
```bash
cd /home/debian/infra/update-allowlist/infra
docker compose -f compose.dev.yml up -d
```
Ensure ports are published only on `127.0.0.1`.

## 4. Web Application Deployment

1. Configure the environment variables in `/home/debian/infra/update-allowlist/apps/web/.env`:
   ```env
   DATABASE_URL="postgresql://postgres:your-postgres-password@127.0.0.1:5432/allowlist"
   REDIS_URL="redis://127.0.0.1:6379"
   SESSION_SECRET="your-32-char-random-session-secret"
   APP_SIGNING_SECRET="your-32-char-random-signing-secret"
   ADMIN_EMAIL="admin@0err.com"
   SMTP_HOST="127.0.0.1"
   SMTP_PORT="1025"
   PASSKEY_RP_ID="update.0err.com"
   PASSKEY_RP_NAME="0ERR Firewall Update"
   PASSKEY_ORIGIN="https://update.0err.com"
   TRUST_CF_CONNECTING_IP="true"
   ```

2. Build and start the Next.js app:
   ```bash
   cd /home/debian/infra/update-allowlist/apps/web
   pnpm install
   pnpm exec prisma migrate deploy
   pnpm build
   
   # Use PM2 to run the server
   sudo npm install -g pm2
   pm2 start npm --name "update-web" -- start
   ```

## 5. Nginx Stream Configuration

Nginx stream forwards public gateway TCP traffic (ports 15432, 27017, 19000) to the corresponding local ports.

1. Copy the stream config to `/etc/nginx/streams-enabled/` or include it in `/etc/nginx/nginx.conf`:
   ```nginx
   # Add to the bottom of /etc/nginx/nginx.conf
   include /home/debian/infra/update-allowlist/infra/nginx/db-gateway.stream.conf;
   ```

2. Verify and reload Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## 6. nftables Rule Application

Create the initial nftables table and sets:
```bash
sudo nft -f /home/debian/infra/update-allowlist/infra/nftables/shared-dedi.nft
```

## 7. Firewall-Agent Service Deployment

1. Configure the environment variables in `/home/debian/infra/update-allowlist/apps/firewall-agent/.env`:
   ```env
   ALLOWLIST_API_URL="https://update.0err.com/api/agent/allowlist"
   AGENT_TOKEN="your-raw-agent-bearer-token"
   APP_SIGNING_SECRET="your-32-char-random-signing-secret"
   NFT_TABLE="shared_dedi"
   NFT_DB_V4_SET="db_allow_v4"
   NFT_DB_V6_SET="db_allow_v6"
   APPLY_INTERVAL_SECONDS="15"
   FAIL_CLOSED="true"
   DRY_RUN="false"
   ```

2. Build the Go agent binary:
   ```bash
   cd /home/debian/infra/update-allowlist/apps/firewall-agent
   go build -o firewall-agent ./cmd/firewall-agent
   ```

3. Enable and start the systemd unit service:
   ```bash
   sudo cp /home/debian/infra/update-allowlist/infra/systemd/firewall-agent.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable firewall-agent.service
   sudo systemctl start firewall-agent.service
   ```

4. Check the service status and logs:
   ```bash
   sudo systemctl status firewall-agent
   journalctl -u firewall-agent -n 50 -f
   ```

## 8. Docker Compose Stack Deployment (Alternative)

Instead of the host-level setup, you can launch the entire integrated stack (including Next.js and Go agent) using Docker Compose.

1. Generate migrations on the host:
   ```bash
   DATABASE_URL="postgresql://postgres:your-postgres-password@localhost:5432/allowlist" pnpm --filter web exec prisma migrate dev --name init
   ```
2. Build and launch all containers in background daemon mode:
   ```bash
   docker compose -f infra/compose.dev.yml up --build -d
   ```
3. Verify that all 5 services are active and running:
   ```bash
   docker ps
   ```
4. Monitor the database migration, seeding, and Next.js server startup:
   ```bash
   docker logs -f update-web
   ```
5. Check Go firewall agent signature checks and dry-run synchronization cycles:
   ```bash
   docker logs -f update-firewall-agent
   ```

# Adding a New Protected Port

This guide explains how to add a new TCP port to the firewall allowlist system.
Once added, the port will appear in the Protection Port Groups page and can be
selected when creating allowlist rules.

## Architecture Overview

```
User IP ──► nginx stream proxy (public port) ──► Docker container (internal port)
                  │
                  ├── nftables chain `shared_dedi` checks IP against `db_allow_v4`
                  │   └── priority -200 (runs before UFW)
                  │
                  └── Allowlist web app manages IP set + resolves port groups
```

The allowlist protects a fixed set of gateway TCP ports that forward to internal
development database containers. Each port is:

1. Opened in nginx stream proxy (maps public port → localhost:internal)
2. Protected by nftables (drops all IPs except those in the `db_allow_v4` set)
3. Listed in `PROTECTED_PORTS` env var (comma-separated)
4. Grouped under a port group key in the web UI

## Current Port Map

| Public Port | Internal | Container    | Group Key  |
|-------------|----------|--------------|------------|
| 51032       | 50003    | PostgreSQL   | `postgres` |
| 51033       | 50005    | MongoDB      | `mongo`    |
| 51034       | 50006    | MinIO        | `minio`    |
| 51035       | 50004    | Redis        | `redis`    |

## Step-by-Step: Add a New Port

### 1. Choose a Port Number

Pick an unused public port in the **51000-51999** range. The internal infra
stack uses ports 50000-50012, and other Docker services use 52100+.

Example: we'll add **Mongo Express** on public port **51036**, forwarding to
internal port **8081**.

### 2. Add nginx Stream Proxy

Edit `/home/debian/infra/update-allowlist/infra/nginx/db-gateway.stream.conf`:

```nginx
# Add this block:
server {
    listen 51036;
    proxy_pass 127.0.0.1:8081;
}
```

Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Add nftables Rule

Edit `/home/debian/infra/update-allowlist/infra/nftables/shared-dedi.nft`.
Add the new port to the `tcp dport` list in the `input` chain:

```bash
# BEFORE:
tcp dport {51032, 51033, 51034, 51035} ip saddr != @db_allow_v4 drop

# AFTER:
tcp dport {51032, 51033, 51034, 51035, 51036} ip saddr != @db_allow_v4 drop
```

Apply the updated ruleset:

```bash
sudo nft -f /home/debian/infra/update-allowlist/infra/nftables/shared-dedi.nft
```

### 4. Open Port in UFW (Debian)

Even though nftables runs first (priority -200), traffic that passes through
the nftables chain still reaches UFW (priority 0). Add a UFW allow rule:

```bash
sudo ufw allow 51036/tcp comment 'Mongo Express gateway'
```

Verify:

```bash
sudo ufw status | grep 51036
```

### 5. Update PROTECTED_PORTS Environment Variable

Edit `/home/debian/infra/update-allowlist/.env`:

```bash
# BEFORE:
PROTECTED_PORTS=51032,51033,51034,51035

# AFTER:
PROTECTED_PORTS=51032,51033,51034,51035,51036
```

Restart the web container to pick up the change:

```bash
cd /home/debian/infra/update-allowlist
sudo docker compose up -d web
```

### 6. Create a Port Group

Go to the web UI at **https://update.0err.com/port-groups**, click **Add Group**,
and create a new group:

| Field       | Value                          |
|-------------|--------------------------------|
| Key         | `mongo-express`                |
| Name        | Mongo Express                  |
| Description | Port 51036                     |
| Ports       | 51036                          |

The **All Dev Databases** group (key `all`) automatically picks up the new port
because it dynamically computes the union of all enabled port groups.

### 7. Verify

Check the protected ports API returns the new port:

```bash
curl -s https://update.0err.com/api/protected-ports
# {"ports":[51032,51033,51034,51035,51036]}
```

Verify nftables allows the port for a test IP:

```bash
# Add a test IP to the allowlist via the web UI, then:
nft list set inet shared_dedi db_allow_v4
```

Test connectivity from the allowed IP:

```bash
telnet update.0err.com 51036
```

## Rollback

If something goes wrong:

1. Remove the port from `.env` → `PROTECTED_PORTS=51032,51033,51034,51035`
2. Remove the UFW rule: `sudo ufw delete allow 51036/tcp`
3. Remove the nftables port from `shared-dedi.nft` and reapply: `sudo nft -f ...`
4. Remove the nginx stream block and reload: `sudo systemctl reload nginx`
5. Restart web: `sudo docker compose up -d web`

## Common Pitfalls

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Port not visible in UI | `PROTECTED_PORTS` env var not updated or web not restarted | Check `.env`, run `sudo docker compose up -d web` |
| Connection refused | nginx stream proxy not configured | Check `/etc/nginx/streams-enabled/`, reload nginx |
| Connection times out | nftables dropping traffic | Verify port is in the `tcp dport` list in `shared-dedi.nft` |
| UFW blocks after nftables allows | Missing UFW allow rule | Run `sudo ufw allow PORT/tcp` |
| Port group doesn't show in allowlist form | Group not created or disabled | Check Port Groups page, ensure group is enabled |

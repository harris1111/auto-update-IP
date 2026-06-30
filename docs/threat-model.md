# Threat Model — update.0err.com Allowlist Gateway

This document analyzes the security threat landscape and defines mitigations for the dynamic allowlist system.

## 1. Threats and Mitigations

### 1.1 Attacker Guesses DB Gateway Port
* **Threat**: An attacker port-scans the server, identifies gateway ports (15432, 27017, 19000), and attempts brute-force authentication.
* **Mitigation**: `nftables` operates in a **fail-closed** mode. All packets sent to gateway ports from non-whitelisted IPs are dropped at the network layer. Scans from unauthorized IPs see these ports as filtered/closed.

### 1.2 Shared NAT Public IP Risk
* **Threat**: An admin whitelists their current public IP, which is a shared CGNAT IP (e.g., in a coffee shop or office). Other users on the same NAT get access to the DB gateway.
* **Mitigation**: Access is only granted to gateway ports, not raw services. The databases themselves still require strong database credentials. Temporary entries use short-lived TTLs (default 2 hours) to minimize the vulnerability window.

### 1.3 Stale Persistent Whitelist Entries
* **Threat**: A persistent entry is added for a home IP. The admin later relocates, but the IP remains whitelisted indefinitely, potentially inherited by a new subscriber.
* **Mitigation**: Persistent entries must be clearly labeled in the dashboard. Regular audits and a "revoke all" mechanism exist to clear all entries. We recommend using temporary rules with custom TTLs whenever possible.

### 1.4 Compromised Admin Session
* **Threat**: An attacker gains access to an active admin browser session (via session hijacking or physical access) and attempts to whitelist an malicious IP.
* **Mitigation**: All allowlist mutations (create, edit, delete, revoke) require cryptographic **step-up authentication** (Passkey or fallback OTP). Session hijackers cannot mutate rules without passing the step-up challenge.

### 1.5 Compromised Admin Email
* **Threat**: An attacker compromises the admin email account and uses it to receive OTP step-up verification codes.
* **Mitigation**: Passkeys (WebAuthn) are the primary authentication factor. The OTP fallback email address (`ADMIN_EMAIL`) is defined exclusively in the backend env and is never printed in any UI/API response.

### 1.6 Lost Passkey
* **Threat**: Admin loses their registered passkey device and is locked out of allowlist CRUD.
* **Mitigation**: The system supports secure OTP fallback verification sent to the configured `ADMIN_EMAIL` to allow administrative recovery and registering new passkeys.

### 1.7 Leaked Agent Token
* **Threat**: The firewall daemon bearer token is leaked. An attacker uses it to fetch the current allowlist or report fake success states.
* **Mitigation**: The API requires HMAC payload signing in addition to the bearer token for agent requests. Even if a token is leaked, an attacker cannot forge allowlist entries without the `APP_SIGNING_SECRET`. Tokens are hashed in the database (`agent_tokens.token_hash`) using SHA-256 so leaks of the DB do not expose raw tokens.

### 1.8 Tampered Allowlist Payload
* **Threat**: An attacker intercepts the allowlist API response in transit or via DNS spoofing, altering it to inject unauthorized IPs.
* **Mitigation**: The allowlist payload is signed on the server using HMAC-SHA256 with `APP_SIGNING_SECRET`. The Go agent calculates the canonical JSON hash of the response and verifies it. Any tampered payload is rejected, and the agent fails closed.

### 1.9 Spoofed X-Forwarded-For
* **Threat**: An attacker sends requests with spoofed `X-Forwarded-For` or `CF-Connecting-IP` headers to get their IP whitelisted.
* **Mitigation**: The system only trusts `CF-Connecting-IP` if Cloudflare Access is verified. Arbitrary headers are discarded in production.

### 1.10 Direct Origin Access
* **Threat**: An attacker bypasses Cloudflare entirely and connects to the Next.js origin IP directly.
* **Mitigation**: Nginx on the web server only allows web traffic from Cloudflare IP ranges. Local database access is blocked by default via `nftables` except for whitelisted source IPs.

### 1.11 Cloudflare Access Misconfiguration
* **Threat**: Cloudflare Access is bypassed or disabled, exposing Next.js routes.
* **Mitigation**: Next.js verifies the Cloudflare Access JWT cryptographically on the server using JWKS keys, acting as a second layer of defense.

### 1.12 Redis Exposure Risk
* **Threat**: Redis is exposed to the public internet, allowing credentials to be read.
* **Mitigation**: Redis binds strictly to `127.0.0.1:6379` in the Docker Compose / local system configuration. No public Nginx stream exists for Redis.

### 1.13 Docker Port Publishing Pitfalls
* **Threat**: Docker bypasses standard UFW/iptables rules when ports are published.
* **Mitigation**: Docker containers for Postgres and Redis only publish ports on `127.0.0.1` (e.g., `-p 127.0.0.1:5432:5432`). They are unreachable from the public interface. Public gateways are exposed exclusively via Nginx stream proxy.

### 1.14 Bad nftables Rule
* **Threat**: The agent applies a malformed nftables rule that locks out the admin from SSH or flushes the firewall.
* **Mitigation**: The agent does not modify the overall firewall table or chains. It only flushes and adds elements to its specific sets (`db_allow_v4` and `db_allow_v6`). It uses atomic transactions (`nft -f -`) to prevent transient configurations.

### 1.15 Firewall-Agent Unavailable
* **Threat**: The Go agent crashes or loses connection to the Next.js API.
* **Mitigation**: The dashboard detects if the agent is stale (warning banner). The firewall remains in its last applied state, keeping existing active developer connections open but preventing new ones until the agent is recovered.

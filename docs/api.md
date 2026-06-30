# API Specification — update.0err.com Allowlist Gateway

All API endpoints return JSON payloads and handle authentication securely.

## 1. Authentication APIs

### 1.1 Get Current Session Info
* **Endpoint**: `GET /api/auth/me`
* **Response (Authenticated)**:
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "11111111-1111-1111-1111-111111111111",
      "displayName": "Admin User",
      "role": "admin",
      "passkeyRequired": true,
      "passkeyEnrolled": true
    }
  }
  ```

### 1.2 Logout
* **Endpoint**: `POST /api/auth/logout`
* **Response**:
  ```json
  { "success": true }
  ```

---

## 2. Step-Up Verification APIs

Before any mutating action, the client must obtain a `stepUpToken` by completing a challenge bound to the specific action and payload hash.

### 2.1 Request Email OTP Fallback
* **Endpoint**: `POST /api/step-up/otp/request`
* **Payload**:
  ```json
  {
    "action": "allowlist.create",
    "payloadHash": "sha256-of-canonical-action-payload"
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "message": "OTP sent to the configured admin mailbox."
  }
  ```

### 2.2 Verify OTP Fallback
* **Endpoint**: `POST /api/step-up/otp/verify`
* **Payload**:
  ```json
  {
    "action": "allowlist.create",
    "payloadHash": "sha256-of-canonical-action-payload",
    "otp": "123456"
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "stepUpToken": "jwt-step-up-token-valid-for-5-minutes"
  }
  ```

### 2.3 WebAuthn Passkey Step-Up Options
* **Endpoint**: `POST /api/step-up/passkey/options`
* **Response**: Standard WebAuthn authentication options.

### 2.4 Verify Passkey Step-Up
* **Endpoint**: `POST /api/step-up/passkey/verify`
* **Payload**:
  ```json
  {
    "action": "allowlist.create",
    "payloadHash": "sha256-of-canonical-action-payload",
    "body": { "id": "credential-id", "response": { ... } }
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "stepUpToken": "jwt-step-up-token-valid-for-5-minutes"
  }
  ```

---

## 3. Allowlist CRUD APIs

### 3.1 Get Allowlist Entries
* **Endpoint**: `GET /api/allowlist`
* **Response**: Array of active and historical entries.

### 3.2 Create Allowlist Entry
* **Endpoint**: `POST /api/allowlist`
* **Payload**:
  ```json
  {
    "ipCidr": "1.2.3.4/32",
    "label": "Home Office",
    "reason": "Admin access",
    "portGroupKeys": ["postgres", "mongo"],
    "mode": "temporary",
    "ttlMinutes": 120,
    "stepUpToken": "jwt-step-up-token-valid-for-5-minutes"
  }
  ```
* **Response**: Newly created entry object.

### 3.3 Revoke a Specific Entry
* **Endpoint**: `POST /api/allowlist/:id/revoke`
* **Payload**:
  ```json
  {
    "stepUpToken": "jwt-step-up-token-valid-for-5-minutes"
  }
  ```
* **Response**:
  ```json
  { "ok": true }
  ```

### 3.4 Revoke All Active Entries (Emergency Close)
* **Endpoint**: `POST /api/allowlist/revoke-all`
* **Payload**:
  ```json
  {
    "stepUpToken": "jwt-step-up-token-valid-for-5-minutes"
  }
  ```
* **Response**:
  ```json
  { "ok": true, "revokedCount": 3 }
  ```

---

## 4. Firewall-Agent Integration APIs

### 4.1 Fetch Signed Allowlist
* **Endpoint**: `GET /api/agent/allowlist`
* **Headers**: `Authorization: Bearer <AGENT_TOKEN>`
* **Response**:
  ```json
  {
    "generatedAt": "2026-06-29T19:00:00.000Z",
    "version": 1719662400000,
    "entries": [
      {
        "id": "uuid-1",
        "ipCidr": "1.2.3.4/32",
        "ipVersion": 4,
        "ports": [15432, 27017],
        "mode": "temporary",
        "expiresAt": "2026-06-29T21:00:00.000Z"
      }
    ],
    "signature": "base64-hmac-sha256-signature"
  }
  ```

### 4.2 Report Apply Status
* **Endpoint**: `POST /api/agent/report`
* **Headers**: `Authorization: Bearer <AGENT_TOKEN>`
* **Payload**:
  ```json
  {
    "status": "success",
    "errorMessage": "",
    "appliedAt": "2026-06-29T19:00:15.000Z"
  }
  ```
* **Response**:
  ```json
  { "ok": true }
  ```

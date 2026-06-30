# Testing Guide — update.0err.com Allowlist Gateway

This document explains the structure and instructions for running the test suites across the monorepos.

## 1. Web Application Testing

The Next.js application contains unit, integration, and E2E browser tests under `apps/web/tests/`.

### 1.1 Unit Tests
Unit tests verify input validators and cryptographic hashing/signing helpers.
```bash
# From root
pnpm test:unit
```

### 1.2 Integration Tests
Integration tests mock the Prisma Client and verify session management, OTP challenge lifecycles, and step-up authorization token generation.
```bash
# From root
pnpm test:integration
```

### 1.3 Playwright E2E Tests
Playwright tests verify critical user flows (login, dashboard stats, custom rule creation with step-up verification modal) inside a headless Chromium browser using mocked API intercepts.
```bash
# From root
pnpm test:e2e
```

---

## 2. Firewall Agent Testing

The Go firewall agent tests cover signature verification, payload verification (IP versions, port checking), and atomic nftables transaction generation.

To run Go package tests:
```bash
cd apps/firewall-agent
go test ./... -v
```

---

## 3. Continuous Integration Validation

A root validation script `./scripts/validate.sh` is provided to run all test suites in a single command.

To validate the entire project:
```bash
# On Linux/macOS
./scripts/validate.sh

# On Windows (PowerShell)
powershell ./scripts/validate.sh
```

#!/bin/bash
# Validate build, linting, and all tests

set -e

cd "$(dirname "$0")/.."

echo "=== 1. Running Linter ==="
pnpm --filter web lint

echo "=== 2. Running Web App Unit and Integration Tests ==="
pnpm test

echo "=== 3. Running Web App E2E Tests ==="
pnpm test:e2e

echo "=== 4. Running Go Firewall Agent Tests ==="
cd apps/firewall-agent
go test ./...

echo "=== 5. Running Web App Production Build ==="
cd ../web
pnpm build

echo "=== Validation Succeeded! ==="

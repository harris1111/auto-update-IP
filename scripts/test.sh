#!/bin/bash
# Run all tests in the project

cd "$(dirname "$0")/.."

echo "=== Running Next.js Vitest Tests ==="
pnpm test

echo "=== Running Go Firewall Agent Tests ==="
cd apps/firewall-agent
go test ./... -v

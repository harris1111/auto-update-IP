#!/bin/bash
# Generate secure random secrets for the application using openssl

set -euo pipefail

if ! command -v openssl &> /dev/null; then
  echo "ERROR: openssl is required to generate secrets"
  exit 1
fi

echo "# === Generated Secrets ==="
echo "# Copy these into your .env file"
echo ""
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "REDIS_PASSWORD=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "APP_SIGNING_SECRET=$(openssl rand -hex 32)"
echo "AGENT_TOKEN=agt_$(openssl rand -hex 24)"

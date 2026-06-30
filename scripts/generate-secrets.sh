#!/bin/bash
# Generate secure random secrets for the application

echo "=== Generated Secrets ==="
if command -v openssl &> /dev/null; then
  echo "SESSION_SECRET=$(openssl rand -hex 32)"
  echo "APP_SIGNING_SECRET=$(openssl rand -hex 32)"
  echo "AGENT_TOKEN=agt_$(openssl rand -hex 24)"
else
  # Fallback if openssl is not present
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  APP_SIGNING_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  AGENT_TOKEN="agt_"$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  echo "SESSION_SECRET=$SESSION_SECRET"
  echo "APP_SIGNING_SECRET=$APP_SIGNING_SECRET"
  echo "AGENT_TOKEN=$AGENT_TOKEN"
fi

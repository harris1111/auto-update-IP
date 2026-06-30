#!/bin/bash
# Start Docker dev containers and the Next.js dev server

cd "$(dirname "$0")/.."
docker compose -f infra/compose.dev.yml up -d
pnpm --filter web dev -p 5000 -H 127.0.0.1

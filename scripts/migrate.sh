#!/bin/bash
# Apply database migrations locally

cd "$(dirname "$0")/../apps/web"
pnpm exec prisma migrate dev

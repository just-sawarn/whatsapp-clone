#!/usr/bin/env bash
# Runs the client data layer (the real service functions, with real end-to-end crypto) against a throwaway
# Postgres + PostgREST stack with all migrations applied and RLS on. Requires Docker.
# Usage: scripts/test-api.sh [vitest args]
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/stack.sh
start_stack
npx vitest run --config vitest.integration.config.ts "$@"

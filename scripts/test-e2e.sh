#!/usr/bin/env bash
# Drives the real UI in Chrome against the local stack (no real Supabase project is contacted).
# Requires Docker and Google Chrome. Screenshots land in tests/e2e/screenshots.
#   scripts/test-e2e.sh            dev server (Vite)
#   E2E_MODE=prod scripts/test-e2e.sh   production build served with the shipped CSP headers
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/stack.sh
start_stack
if [ "${E2E_MODE:-dev}" = "prod" ]; then
  npx vitest run --config vitest.e2e.prod.config.ts "$@"
else
  npx vitest run --config vitest.e2e.config.ts "$@"
fi

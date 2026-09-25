#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres container and runs the SQL policy tests.
# Requires Docker. Usage: scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="wa-migration-test-$$"
PORT="${TEST_DB_PORT:-54329}"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "$PORT:5432" postgres:16 >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 0.5
done
sleep 1

run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ stubs"
run < supabase/tests/00_supabase_stubs.sql
for file in supabase/migrations/*.sql; do
  echo "→ $(basename "$file")"
  run < "$file"
done
shopt -s nullglob
for file in supabase/tests/[1-9]*.sql; do
  echo "→ $(basename "$file")"
  run < "$file"
done
echo "✓ all migrations applied and all policy tests passed"

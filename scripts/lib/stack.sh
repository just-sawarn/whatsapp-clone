#!/usr/bin/env bash
# Shared helpers: start a throwaway Postgres + PostgREST stack with every migration applied.
# Source this file, call start_stack, and cleanup runs automatically on exit. Requires Docker.
TAG="$$"
NET="wa-stack-net-$TAG"
DB="wa-stack-db-$TAG"
REST="wa-stack-rest-$TAG"
DB_PORT="${TEST_DB_PORT:-54330}"
REST_PORT="${TEST_REST_PORT:-54331}"
JWT_SECRET="test-secret-test-secret-test-secret-1234"

stack_cleanup() {
  docker rm -f "$REST" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

start_stack() {
  trap stack_cleanup EXIT
  docker network create "$NET" >/dev/null
  docker run -d --name "$DB" --network "$NET" --network-alias db -e POSTGRES_PASSWORD=test -p "$DB_PORT:5432" postgres:16 >/dev/null
  for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
  sleep 1
  local run=(docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q)
  "${run[@]}" < supabase/tests/00_supabase_stubs.sql >/dev/null 2>&1
  for file in supabase/migrations/*.sql; do "${run[@]}" < "$file" >/dev/null; done
  docker run -d --name "$REST" --network "$NET" -p "$REST_PORT:3000" \
    -e PGRST_DB_URI="postgres://authenticator:test@db:5432/postgres" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_JWT_SECRET="$JWT_SECRET" postgrest/postgrest >/dev/null
  for _ in $(seq 1 60); do curl -sf "http://localhost:$REST_PORT/" >/dev/null 2>&1 && break; sleep 0.5; done
  export TEST_DB_PORT="$DB_PORT" TEST_REST_PORT="$REST_PORT" TEST_JWT_SECRET="$JWT_SECRET"
}

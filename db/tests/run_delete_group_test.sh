#!/usr/bin/env bash
# Tests db/migrations/2026-10-15_delete_group_rpc.sql against a throwaway
# Postgres in Docker (no Supabase, no production data). Prints FAIL lines and
# exits non-zero if any check is false.
set -euo pipefail
cd "$(dirname "$0")"
name=eventli-delete-group-test-$$
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1' EXIT
until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
sleep 1
psql() { docker exec -i "$name" psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
psql < delete_group_schema.sql
psql < ../migrations/2026-10-15_delete_group_rpc.sql
out=$(psql -A -t -F ' | ' < delete_group_test.sql)
echo "$out"
if echo "$out" | grep -q '| f$'; then echo "FAIL"; exit 1; fi
echo "ALL PASS"

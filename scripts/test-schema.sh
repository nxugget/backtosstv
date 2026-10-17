#!/usr/bin/env bash
# Builds the schema from scratch out of supabase/migrations and asserts what it must guarantee:
# that the anonymous role cannot reach the catalogue, that an administrator can, that the bounds
# hold, and that the audit columns cannot be forged.
#
# Needs a Postgres 15 or later to talk to, and nothing else: no Supabase, no Docker. The platform
# objects the migrations lean on are recreated by supabase/tests/00-platform.sql.
#
#   DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres bash scripts/test-schema.sh
#
# The database is left as the migrations made it, so it can be inspected afterwards. Point this at a
# throwaway database: it creates and drops its own schemas inside it.
set -euo pipefail

database_url="${DATABASE_URL:-postgres://postgres@127.0.0.1:5432/postgres}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run() {
  psql "$database_url" --quiet --no-psqlrc --tuples-only --no-align \
    --set ON_ERROR_STOP=on \
    --set VERBOSITY=terse \
    -f "$1"
}

echo "== resetting =="
psql "$database_url" --quiet --no-psqlrc --set ON_ERROR_STOP=on -c '
  drop schema if exists tests cascade;
  drop schema if exists storage cascade;
  drop schema if exists auth cascade;
  drop schema if exists public cascade;
  create schema public;
  drop role if exists anon;
  drop role if exists authenticated;
  drop role if exists service_role;
' > /dev/null

echo "== platform shim =="
run "$root/supabase/tests/00-platform.sql" > /dev/null

echo "== migrations =="
for migration in "$root"/supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$migration")"
  run "$migration" > /dev/null
done

echo "== assertions =="
# Each assertion reports through a notice, so the notices are the output rather than noise. psql
# prefixes them with its own file and line, which only matters when one fails.
# `set -e` would abort here on a failing assertion, before anything had been printed, so the status
# is taken by hand: a failure has to show which assertion it was.
set +e
output="$(PGOPTIONS='--client-min-messages=notice' run "$root/supabase/tests/10-assertions.sql" 2>&1)"
status=$?
set -e

printf '%s\n' "$output" |
  sed -E -e 's/^psql:.*: (NOTICE|ERROR):  /\1 /' -e 's/^NOTICE //' -e '/^$/d'

printf '\n%d assertions passed\n' "$(printf '%s\n' "$output" | grep -c 'ok    ')"

exit "$status"

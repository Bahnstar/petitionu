#!/usr/bin/env bash
set -euo pipefail
: "${1:?Usage: scripts/restore-smoke.sh PATH.dump}"
: "${PGHOST:?Set PGHOST to a disposable PostgreSQL server}"
: "${PGUSER:?Set PGUSER for the disposable PostgreSQL server}"
restore_database="petitionu_restore_$(date +%s)_${RANDOM}"
createdb "$restore_database"
trap 'dropdb --if-exists "$restore_database"' EXIT
pg_restore --exit-on-error --no-owner --no-acl --dbname="$restore_database" "$1"
migration_count=$(psql --dbname="$restore_database" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT count(*) FROM schema_migrations;')
if [[ ! "$migration_count" =~ ^[0-9]+$ ]] || (( migration_count == 0 )); then
  printf '%s\n' 'The restored database has no migration records.' >&2
  exit 1
fi
printf 'Verified %s restored migration records.\n' "$migration_count"
printf 'Restore succeeded in disposable database %s\n' "$restore_database"

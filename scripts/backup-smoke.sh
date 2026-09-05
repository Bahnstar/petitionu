#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGHOST:?Set PGHOST to a disposable PostgreSQL server}"
: "${PGUSER:?Set PGUSER for the disposable PostgreSQL server}"
source_database="petitionu_backup_$(date +%s)_${RANDOM}"
smoke_directory=$(mktemp -d)
createdb "$source_database"
trap 'dropdb --if-exists "$source_database"; rm -rf "$smoke_directory"' EXIT
psql --dbname="$source_database" --no-psqlrc --set=ON_ERROR_STOP=1 --command="CREATE TABLE schema_migrations (version bigint PRIMARY KEY); INSERT INTO schema_migrations VALUES (20260905000000);"
DATABASE_URL="postgresql:///${source_database}" scripts/backup.sh "$smoke_directory/backup.dump"
scripts/restore-smoke.sh "$smoke_directory/backup.dump"

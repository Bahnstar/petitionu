#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the source PostgreSQL database}"
: "${1:?Usage: scripts/backup.sh PATH.dump}"
umask 077
if [[ -e "$1" ]]; then
  printf '%s\n' 'Refusing to overwrite an existing backup.' >&2
  exit 1
fi
backup_tmp=$(mktemp "${1}.XXXXXX")
trap 'rm -f "$backup_tmp"' EXIT
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_tmp"
mv "$backup_tmp" "$1"
printf 'Backup saved to %s\n' "$1"

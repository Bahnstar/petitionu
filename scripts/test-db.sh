#!/usr/bin/env bash
# Start the dedicated Postgres used by the server tests. Safe to run repeatedly.
# Tests create their own uniquely named databases on it, so worktrees can share it.
set -euo pipefail

name=petitionu-effect-pg
port=55432

state=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || true)
case "$state" in
  running) ;;
  "")
    docker run -d --name "$name" \
      -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
      -p "127.0.0.1:${port}:5432" postgres:17 >/dev/null
    ;;
  *) docker start "$name" >/dev/null ;;
esac

for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -q; then
    echo "Test Postgres is ready: postgres://postgres:postgres@127.0.0.1:${port}/postgres"
    exit 0
  fi
  sleep 0.5
done
echo "Test Postgres did not become ready" >&2
exit 1

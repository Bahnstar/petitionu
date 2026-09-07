#!/usr/bin/env python3
"""Compare application row counts after restoring a backup into a new database."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from urllib.parse import quote

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 scripts/backup-restore-check.py SOURCE_DATABASE")
for key in ("PGHOST", "PGUSER"):
    if not os.environ.get(key):
        raise SystemExit(f"Set {key} to a disposable PostgreSQL server")

source_database = sys.argv[1]
tables = ["users", "petition", "signature", "comment", "classrooms", "classroom_memberships", "content_reports", "support_requests", "schema_migrations"]


def counts(database):
    return {
        table: int(subprocess.check_output([
            "psql", "--dbname=" + database, "--no-psqlrc", "--tuples-only", "--no-align",
            "--set=ON_ERROR_STOP=1", "--command", f'SELECT count(*) FROM "{table}";',
        ], text=True).strip())
        for table in tables
    }


source = counts(source_database)
restore_database = "petitionu_restore_check_" + secrets.token_hex(6)
with tempfile.TemporaryDirectory(prefix="petitionu-backup-check-") as directory:
    archive = Path(directory) / "backup.dump"
    environment = os.environ.copy()
    environment["DATABASE_URL"] = "postgresql:///" + quote(source_database, safe="")
    subprocess.run([str(Path(__file__).with_name("backup.sh")), str(archive)], env=environment, check=True)
    subprocess.run(["createdb", restore_database], check=True)
    try:
        subprocess.run([
            "pg_restore", "--exit-on-error", "--no-owner", "--no-acl",
            "--dbname=" + restore_database, str(archive),
        ], check=True)
        restored = counts(restore_database)
        assert source == restored, (source, restored)
        print(json.dumps({"matching_source_and_restored_counts": source}, indent=2))
    finally:
        subprocess.run(["dropdb", restore_database], check=True)

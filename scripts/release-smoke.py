#!/usr/bin/env python3
"""Verify the built Node server against a disposable PostgreSQL database.

Build first with `bun run build`. Set PGHOST, PGUSER and, when needed, PGPORT and
PGPASSWORD to a disposable PostgreSQL server; the PostgreSQL client tools must be on PATH.
"""
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

server = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/server/dist").resolve()
for entry in ("serve.js", "migrate.js", "operator.js"):
    if not (server / entry).is_file():
        raise SystemExit(f"{server / entry} is missing; run `bun run build` first")
# Needs no database or secrets, so a bundle that can't even start fails here.
operator_help = subprocess.run(
    ["node", str(server / "operator.js"), "--help"],
    env={"PATH": os.environ["PATH"]}, capture_output=True, text=True, timeout=30,
)
if operator_help.returncode != 0 or "set-role" not in operator_help.stdout:
    raise SystemExit(f"operator.js --help failed:\n{operator_help.stdout}{operator_help.stderr}")
database = f"petitionu_release_{secrets.token_hex(6)}"
environment = os.environ.copy()
for key in ("PGHOST", "PGUSER"):
    if not environment.get(key):
        raise SystemExit(f"Set {key} to a disposable PostgreSQL server")
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
credentials = urllib.parse.quote(environment["PGUSER"], safe="")
if environment.get("PGPASSWORD"):
    credentials += ":" + urllib.parse.quote(environment["PGPASSWORD"], safe="")
address = f"{environment['PGHOST']}:{environment.get('PGPORT', '5432')}"
environment.update(
    NODE_ENV="production",
    DATABASE_URL=f"postgresql://{credentials}@{address}/{database}",
    DATABASE_SSL="false",
    PUBLIC_HOST="localhost",
    PORT=str(port),
    BETTER_AUTH_SECRET=secrets.token_urlsafe(48),
    CSRF_SECRET=secrets.token_urlsafe(48),
    RESEND_API_KEY="release-smoke-no-delivery",
    MAIL_FROM="smoke@example.test",
    SUPPORT_EMAIL="support@example.test",
)

def check_health(expected, log):
    process = subprocess.Popen(
        ["node", str(server / "serve.js")], env=environment, stdout=log, stderr=log,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Server exited with {process.returncode}")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=4) as response:
                    status, body = response.status, response.read()
            except urllib.error.HTTPError as error:
                status, body = error.code, error.read()
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.2)
                continue
            if expected == 200 and status == 503:
                assert json.loads(body) == {"status": "unavailable"}, body
                time.sleep(0.2)
                continue
            assert status == expected, (status, body)
            assert json.loads(body) == {"status": "ok" if expected == 200 else "unavailable"}, body
            print(f"Server /healthz returned {expected}", flush=True)
            return
        raise RuntimeError("Server did not serve health checks within 45 seconds")
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()

subprocess.run(["createdb", database], env=environment, check=True)
try:
    with tempfile.TemporaryDirectory(prefix="petitionu-release-smoke-") as temporary:
        log_path = Path(temporary) / "server.log"
        with log_path.open("w+") as log:
            try:
                for _ in range(2):
                    subprocess.run(
                        ["node", str(server / "migrate.js")],
                        env=environment, stdout=log, stderr=log, check=True,
                    )
                print("Migrations succeeded twice", flush=True)
                check_health(200, log)
                environment["DATABASE_URL"] = f"postgresql://{credentials}@127.0.0.1:1/{database}"
                check_health(503, log)
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
finally:
    subprocess.run(["dropdb", "--if-exists", database], env=os.environ.copy(), check=True)

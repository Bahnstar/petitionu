#!/usr/bin/env python3
"""Verify a built release against a disposable PostgreSQL database."""
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
import urllib.request

release = Path(sys.argv[1] if len(sys.argv) > 1 else "_build/prod/rel/petitionu").resolve()
executable = release / "bin/petitionu"
database = f"petitionu_release_{secrets.token_hex(6)}"
environment = os.environ.copy()
for key in ("PGHOST", "PGUSER"):
    if not environment.get(key):
        raise SystemExit(f"Set {key} to a disposable PostgreSQL server")
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
environment.update(
    DATABASE_URL=f"postgresql:///{database}",
    DATABASE_SSL="false",
    SECRET_KEY_BASE=secrets.token_urlsafe(64),
    TOKEN_SIGNING_SECRET=secrets.token_urlsafe(64),
    PHX_HOST="localhost",
    PHX_SERVER="true",
    PORT=str(port),
    RESEND_API_KEY="release-smoke-no-delivery",
    MAIL_FROM="smoke@example.test",
    SUPPORT_EMAIL="support@example.test",
    RELEASE_DISTRIBUTION="none",
)

def check_health(expected, log):
    process = subprocess.Popen(
        [str(executable), "start"], env=environment, stdout=log, stderr=log,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Release exited with {process.returncode}")
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
            print(f"Release /healthz returned {expected}", flush=True)
            return
        raise RuntimeError("Release did not serve health checks within 45 seconds")
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
        log_path = Path(temporary) / "release.log"
        with log_path.open("w+") as log:
            try:
                for _ in range(2):
                    subprocess.run(
                        [str(executable), "eval", "Petitionu.Release.migrate()"],
                        env=environment, stdout=log, stderr=log, check=True,
                    )
                print("Release migrations succeeded twice", flush=True)
                check_health(200, log)
                environment["DATABASE_URL"] = f"postgresql://localhost:1/{database}"
                check_health(503, log)
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
finally:
    subprocess.run(["dropdb", "--if-exists", database], env=os.environ.copy(), check=True)

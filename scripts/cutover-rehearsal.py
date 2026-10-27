#!/usr/bin/env python3
"""Rehearse the cutover from the Elixir app against a copy of a production backup.

Usage:
  CUTOVER_PASSWORD=... python3 scripts/cutover-rehearsal.py BACKUP.dump --email USER@CAMPUS.EDU

Restores the `pg_dump` custom-format archive into a new database on a disposable PostgreSQL
server, runs the migrate entry point, starts the server, and checks `/healthz`, a password
sign-in for the given existing account (with its original password) and `getMe` with the new
session. Build first with `bun run build`. Set PGHOST, PGUSER and, when needed, PGPORT and
PGPASSWORD to the disposable server; the PostgreSQL client tools must be on PATH. The password
comes from CUTOVER_PASSWORD so it stays out of shell history and process listings.

The server runs with JOB_WORKERS=false and dummy mail credentials, so it sends no email and
contacts no school registry. The restored database is dropped at the end unless --keep is given.
"""
import argparse
import http.cookies
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

parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
parser.add_argument("archive", type=Path, help="pg_dump custom-format archive (scripts/backup.sh)")
parser.add_argument("--email", required=True, help="an existing account to sign in as")
parser.add_argument("--server", type=Path, default=Path("apps/server/dist"), help="built server")
parser.add_argument("--keep", action="store_true", help="keep the restored database")
arguments = parser.parse_args()

password = os.environ.get("CUTOVER_PASSWORD")
if not password:
    raise SystemExit("Set CUTOVER_PASSWORD to the account's password")
if not arguments.archive.is_file():
    raise SystemExit(f"{arguments.archive} is not a file")
server = arguments.server.resolve()
for entry in ("serve.js", "migrate.js"):
    if not (server / entry).is_file():
        raise SystemExit(f"{server / entry} is missing; run `bun run build` first")
environment = os.environ.copy()
for key in ("PGHOST", "PGUSER"):
    if not environment.get(key):
        raise SystemExit(f"Set {key} to a disposable PostgreSQL server")
environment.pop("CUTOVER_PASSWORD")

database = f"petitionu_cutover_{secrets.token_hex(6)}"
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
credentials = urllib.parse.quote(environment["PGUSER"], safe="")
if environment.get("PGPASSWORD"):
    credentials += ":" + urllib.parse.quote(environment["PGPASSWORD"], safe="")
address = f"{environment['PGHOST']}:{environment.get('PGPORT', '5432')}"
public_host = "localhost"
origin = f"https://{public_host}"
base = f"http://127.0.0.1:{port}"
environment.update(
    NODE_ENV="production",
    DATABASE_URL=f"postgresql://{credentials}@{address}/{database}",
    DATABASE_SSL="false",
    PUBLIC_HOST=public_host,
    PORT=str(port),
    BETTER_AUTH_SECRET=secrets.token_urlsafe(48),
    CSRF_SECRET=secrets.token_urlsafe(48),
    RESEND_API_KEY="cutover-rehearsal-no-delivery",
    MAIL_FROM="rehearsal@example.test",
    SUPPORT_EMAIL="support@example.test",
    JOB_WORKERS="false",
)


def psql(command):
    return subprocess.check_output(
        ["psql", f"--dbname={database}", "--no-psqlrc", "--tuples-only", "--no-align",
         "--set=ON_ERROR_STOP=1", "--command", command],
        env=environment, text=True,
    ).strip()


def counts():
    tables = ["users", "petition", "signature", "comment", "classrooms", "content_reports"]
    return {table: int(psql(f'SELECT count(*) FROM "{table}"')) for table in tables}


def request(method, path, body=None, headers=None, cookies=None):
    data = None if body is None else json.dumps(body).encode()
    sent = {"origin": origin, "x-forwarded-for": "127.0.0.1", **(headers or {})}
    if data is not None:
        sent["content-type"] = "application/json"
    if cookies:
        sent["cookie"] = "; ".join(f"{name}={value}" for name, value in cookies.items())
    req = urllib.request.Request(base + path, data=data, method=method, headers=sent)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def wait_for_health(process):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Server exited with {process.returncode}")
        try:
            status, _, body = request("GET", "/healthz")
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.2)
            continue
        if status == 200:
            assert json.loads(body) == {"status": "ok"}, body
            print("Server /healthz returned 200", flush=True)
            return
        time.sleep(0.2)
    raise RuntimeError("Server did not become healthy within 45 seconds")


def check_sign_in():
    status, headers, body = request(
        "POST", "/api/auth/sign-in/email", {"email": arguments.email, "password": password}
    )
    if status != 200:
        raise RuntimeError(f"Password sign-in returned {status}: {body[:200]!r}")
    cookies = {}
    for header in headers.get_all("set-cookie") or []:
        jar = http.cookies.SimpleCookie()
        jar.load(header)
        cookies.update({name: morsel.value for name, morsel in jar.items()})
    print("Password sign-in succeeded", flush=True)

    _, _, token_body = request("GET", "/rpc/csrf-token", cookies=cookies)
    token = json.loads(token_body)["token"]
    status, _, body = request(
        "POST", "/rpc",
        {"_tag": "Request", "id": "1", "tag": "getMe", "payload": None, "headers": []},
        headers={"x-csrf-token": token}, cookies=cookies,
    )
    replies = json.loads(body)
    exit_ = (replies[0] if isinstance(replies, list) else replies).get("exit", {})
    if status != 200 or exit_.get("_tag") != "Success":
        raise RuntimeError(f"getMe failed ({status}): {body[:300]!r}")
    email = exit_["value"].get("email", "")
    if email.lower() != arguments.email.lower():
        raise RuntimeError("getMe returned a different account")
    print("getMe returned the signed-in account", flush=True)


subprocess.run(["createdb", database], env=environment, check=True)
print(f"Restoring {arguments.archive} into {database}", flush=True)
try:
    subprocess.run(
        ["pg_restore", "--exit-on-error", "--no-owner", "--no-acl", f"--dbname={database}",
         str(arguments.archive)],
        env=environment, check=True,
    )
    before = counts()
    print("Restored rows: " + json.dumps(before), flush=True)
    with tempfile.TemporaryDirectory(prefix="petitionu-cutover-") as temporary:
        log_path = Path(temporary) / "server.log"
        with log_path.open("w+") as log:
            try:
                subprocess.run(
                    ["node", str(server / "migrate.js")],
                    env=environment, stdout=log, stderr=log, check=True,
                )
                print("Migrations succeeded", flush=True)
                after = counts()
                assert before == after, ("migrations changed row counts", before, after)
                print(f"Credential accounts: {psql('SELECT count(*) FROM account')}", flush=True)
                process = subprocess.Popen(
                    ["node", str(server / "serve.js")], env=environment, stdout=log, stderr=log,
                    start_new_session=True,
                )
                try:
                    wait_for_health(process)
                    check_sign_in()
                finally:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
    print("Cutover rehearsal passed", flush=True)
finally:
    if arguments.keep:
        print(f"Kept database {database}", flush=True)
    else:
        subprocess.run(["dropdb", "--if-exists", database], env=os.environ.copy(), check=True)

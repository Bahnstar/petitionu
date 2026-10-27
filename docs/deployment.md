# Deploy PetitionU

PetitionU ships as one Docker image built from `Dockerfile`. Bun installs dependencies and builds the web app and server; the image runs them on Node 24 as the unprivileged `node` user. The image has two entry points:

- serve (the default command): `node apps/server/dist/serve.js` serves the app, the API and `/healthz` on `PORT` (default 4000).
- migrate: `node apps/server/dist/migrate.js` applies pending migrations once and exits. It exits non-zero when a migration fails. Repeating it applies only migrations that have not run.

Use PostgreSQL 16 or later.

## Configure the environment

Copy `.env.example` into your hosting provider's secret configuration, or to `.env` for Compose. Never commit a filled secret file; `.env` is gitignored. The server validates its configuration at startup and keeps secrets out of logs.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. Use an account that may run the migrations. |
| `DATABASE_SSL` | `true` when the database requires TLS. Defaults to `false`. |
| `POOL_SIZE` | Database connections per process. Defaults to 10. |
| `PUBLIC_HOST` | Public hostname, without `https://` or a port. Email links use `https://PUBLIC_HOST`. |
| `PORT` | HTTP port. Defaults to 4000. |
| `BETTER_AUTH_SECRET`, `CSRF_SECRET` | Independent secrets. Generate each with `openssl rand -base64 48`. |
| `RESEND_API_KEY`, `MAIL_FROM`, `SUPPORT_EMAIL` | Resend key, sender address and monitored reply-to mailbox. Without `RESEND_API_KEY`, every email send fails outside development. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OpenTelemetry collector base URL. Export is off when unset. |

Verify your sender domain in Resend before launch. Production logs are JSON, one object per line on stdout.

## Deploy with Docker Compose

`compose.yaml` runs four services on one host:

- `postgres`: PostgreSQL 17 with its data in the `postgres-data` volume and a `pg_isready` health check.
- `migrate`: a one-shot run of the migrate entry point after Postgres is healthy.
- `app`: the serve entry point, started only after `migrate` exits successfully. It listens on port 4000 on the Compose network only and has a `/healthz` health check.
- `cloudflared`: a Cloudflare Tunnel, started once `app` is healthy. It is the only way in from outside.

1. In the Cloudflare Zero Trust dashboard, create a tunnel and copy its token. Add a public hostname for `PUBLIC_HOST` with service `http://app:4000`.
2. Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD`, `TUNNEL_TOKEN`, `PUBLIC_HOST`, the two secrets and the mail variables. Compose builds `DATABASE_URL` from `POSTGRES_PASSWORD` and sets `DATABASE_SSL=false` and `PORT=4000` itself.
3. Back up the database with `scripts/backup.sh` before upgrading a running stack.
4. Run `docker compose up -d --build`. Compose builds the image, waits for Postgres, migrates, starts the app and then the tunnel.
5. Check `docker compose ps`: `migrate` should show `Exited (0)` and `app` should be `healthy`. Read logs with `docker compose logs migrate app`.

Postgres is not published on the host. To run `scripts/backup.sh` against it, run the script inside a container on the Compose network, for example:

```sh
docker compose run --rm --no-deps -v "$PWD/scripts:/scripts:ro" -v /secure/backups:/backups \
  -e DATABASE_URL="postgresql://petitionu:$POSTGRES_PASSWORD@postgres:5432/petitionu" \
  postgres /scripts/backup.sh /backups/petitionu-TIMESTAMP.dump
```

To deploy a new version, pull the code and run step 4 again; `migrate` runs before the new app starts. If `migrate` fails, the old app keeps running and the new one does not start.

Compose also reads `ENV_FILE` (default `.env`) and `PETITIONU_IMAGE` (default `petitionu:latest`), which are useful for a local trial. For example, with dummy secrets in `/tmp/petitionu.env` and a `ports: ["127.0.0.1:8080:4000"]` override for `app` in `/tmp/override.yaml`:

```sh
ENV_FILE=/tmp/petitionu.env docker compose -p petitionu-trial --env-file /tmp/petitionu.env \
  -f compose.yaml -f /tmp/override.yaml up -d --build --wait postgres migrate app
curl --fail http://127.0.0.1:8080/healthz
ENV_FILE=/tmp/petitionu.env docker compose -p petitionu-trial --env-file /tmp/petitionu.env down -v
```

## Deploy on Railway

Connect the repository and select the branch containing `railway.json` and `Dockerfile`. Set Root Directory to `/` and leave Build Command blank. Railway reads the Docker build, the pre-deploy migration (`node apps/server/dist/migrate.js`), the start command (`node apps/server/dist/serve.js`) and the `/healthz` check from `railway.json`. Remove conflicting dashboard overrides.

Add a PostgreSQL service in the same project. In the app's Variables tab, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`, replacing `Postgres` with the actual database service name. Set `POOL_SIZE=5` for the initial deployment.

Generate a public domain under Networking and set `PUBLIC_HOST` to that hostname. Railway supplies `PORT`. Set the secrets and mail variables from the table above. The migration needs `DATABASE_URL` too, so set variables on the service rather than only for the start command.

Deploy and check that the pre-deploy migration succeeds and `/healthz` returns HTTP 200. Railway's free allowance is limited; inspect resource usage after the first deployment.

See [Railway config as code](https://docs.railway.com/config-as-code) and [Docker builds](https://docs.railway.com/builds/dockerfiles).

## Check a deployment

1. Check `curl --fail https://YOUR_HOST/healthz`. A ready app returns `{"status":"ok"}`. A failed database query returns HTTP 503 with `{"status":"unavailable"}` and no database details.
2. Register a test account through the deployed app. Verify confirmation, magic-link sign-in and password-reset email delivery and acceptance links. Use accounts and mailboxes you control.

Keep the previous image available. Roll the app back only when its code supports the migrated schema. Do not run down migrations to recover from a failed deployment.

## Test the build locally

Run `bun install --frozen-lockfile` and `bun run build`. Then set `PGHOST`, `PGUSER` and, when needed, `PGPORT` and `PGPASSWORD` to a disposable PostgreSQL server, put the PostgreSQL client tools on `PATH`, and run `python3 scripts/release-smoke.py`. It creates a temporary database, runs the migrate entry point twice, starts the server and checks HTTP 200, then restarts it against an unreachable database and checks HTTP 503. It stops its own server processes and removes only its temporary database. It uses dummy mail credentials and sends no email.

## Back up and restore

Schedule `DATABASE_URL=... scripts/backup.sh /secure/backups/petitionu-TIMESTAMP.dump` at least daily. The script creates a custom-format PostgreSQL archive with owner and ACL metadata omitted. It refuses to overwrite an existing backup and writes files with private permissions.

Copy backups to encrypted storage outside the database host. Limit access to operators. Configure retention with your hosting provider and record the retention period before launch. Enable provider point-in-time recovery when available.

Run `scripts/backup-smoke.sh` with `PGHOST`, `PGUSER`, and, when needed, `PGPASSWORD` pointing to a disposable PostgreSQL server. It creates source and restored databases with unique names, verifies a restored migration record, and removes only those databases when it exits.

Test a real archive with `scripts/restore-smoke.sh /secure/backups/petitionu-TIMESTAMP.dump` against the disposable server. It restores into a new database and checks that migration records exist. It never restores over an existing database.

To verify application data in a quiet local development database, run `python3 scripts/backup-restore-check.py petitionu_dev` with `PGHOST` and `PGUSER` set to its disposable PostgreSQL server. It backs up that database, restores into a new database, compares counts for nine application and migration tables, and removes only the temporary restore. Pause writes while running it so the source counts and backup describe the same state. This checks restoration and row counts, not every stored value.

For incident recovery, restore the selected archive into a new empty production database with `pg_restore --exit-on-error --no-owner --no-acl`. Validate petition, signature, and user counts and log in with a controlled account. Change `DATABASE_URL` to the restored database only after validation. Record the backup timestamp and any lost writes.

## Monitor the pilot

Configure an external monitor for `/healthz` and alert the responsible operator after repeated failures. Collect application error logs, restart events, and Resend delivery failures. Keep authentication tokens, full email links, and database credentials out of alerts and tickets. Test an alert before admitting students.

The repository provides the release and recovery commands. Hosting, TLS, mail-domain verification, backup scheduling, external alerting, and a successful deployed email check remain operator setup steps.

Email sends are synchronous. A provider failure can roll back registration or a classroom membership change. If the provider accepts a message but its response is lost, a retry can send a duplicate notice. There is no delivery outbox or automatic retry queue in this MVP. Monitor provider failures and test these workflows with the configured sender before launch.

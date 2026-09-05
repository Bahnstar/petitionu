# Deploy PetitionU

Build the release on the same operating system and architecture as the production host. CI builds on Ubuntu 24.04 with Elixir 1.18.4, Erlang/OTP 27.3, Node 22, and Bun 1.4.0. Use PostgreSQL 16 or later. Native dependencies require a C compiler and make during the build.

## Build a release

1. Install the pinned CI toolchain and PostgreSQL client tools.
2. Run `scripts/build-release.sh` from a clean checkout.
3. Copy `_build/prod/petitionu-release.tar.gz` to the host and extract it into a new release directory. The archive preserves executable permissions and includes the Erlang runtime.

CI also runs the backend tests, TypeScript check, asset build, and disposable backup and release checks. CI uploads the release for seven days. Extract the release archive inside the downloaded artifact before using it.

To test the packaged release locally, set `PGHOST`, `PGUSER`, and, when needed, `PGPASSWORD` to a disposable PostgreSQL server and run `python3 scripts/release-smoke.py`. It creates a temporary database, applies migrations twice, checks HTTP 200, then checks HTTP 503 with an unreachable database. It stops its own release processes and removes only its temporary database. It uses dummy mail credentials and sends no email.

## Configure production

Copy `.env.example` into your hosting provider's secret configuration. Do not commit filled secret files.

Set `DATABASE_URL` to the production database. Set `DATABASE_SSL=true` when the database requires TLS. Install its trusted CA on the host. Use a database account with permission to run the included migrations.

Set `PHX_HOST` to the public hostname without a scheme or port. Put the app behind a TLS proxy. Forward the original host and `x-forwarded-proto: https`. Allow app port 4000 only from the proxy and health monitor. Public links in emails use HTTPS.

Generate independent secrets for `SECRET_KEY_BASE` and `TOKEN_SIGNING_SECRET`. Run `mix help phx.gen.secret` before running `mix phx.gen.secret` for each value.

Verify your sender domain in Resend. Set `RESEND_API_KEY` to a key that can send mail from that domain. Set `MAIL_FROM` to its sender address and `SUPPORT_EMAIL` to a monitored mailbox. Production refuses to start if any required variable is missing or an email address is malformed. Development and test retain the local and test mail adapters.

## Apply migrations and start

1. Back up the database with `scripts/backup.sh` before changing a running release.
2. Load the production environment into the release process.
3. Run `bin/petitionu eval 'Petitionu.Release.migrate()'` from the release directory. Run migrations once per deployment before starting the new app. Repeating the command applies only migrations that have not run.
4. Start `PHX_SERVER=true bin/petitionu start` under a process supervisor that restarts failed processes and collects stdout and stderr.
5. Check `curl --fail https://YOUR_HOST/healthz`. A ready app returns `{"status":"ok"}`. A failed database query returns HTTP 503 without database details.
6. Register a test account through the deployed app. Verify confirmation, magic-link sign-in, and password-reset email delivery and acceptance links. Use accounts and mailboxes you control.

Keep the previous release available. Roll the app back only when its code supports the migrated schema. Do not automatically run down migrations to recover from a failed deployment.

## Back up and restore

Schedule `DATABASE_URL=... scripts/backup.sh /secure/backups/petitionu-TIMESTAMP.dump` at least daily. The script creates a custom-format PostgreSQL archive with owner and ACL metadata omitted. It refuses to overwrite an existing backup and writes files with private permissions.

Copy backups to encrypted storage outside the database host. Limit access to operators. Configure retention with your hosting provider and record the retention period before launch. Enable provider point-in-time recovery when available.

Run `scripts/backup-smoke.sh` with `PGHOST`, `PGUSER`, and, when needed, `PGPASSWORD` pointing to a disposable PostgreSQL server. It creates source and restored databases with unique names, verifies a restored migration record, and removes only those databases when it exits.

Test a real archive with `scripts/restore-smoke.sh /secure/backups/petitionu-TIMESTAMP.dump` against the disposable server. It restores into a new database and checks that migration records exist. It never restores over an existing database.

For incident recovery, restore the selected archive into a new empty production database with `pg_restore --exit-on-error --no-owner --no-acl`. Validate petition, signature, and user counts and log in with a controlled account. Change `DATABASE_URL` to the restored database only after validation. Record the backup timestamp and any lost writes.

## Monitor the pilot

Configure an external monitor for `/healthz` and alert the responsible operator after repeated failures. Collect application error logs, restart events, and Resend delivery failures. Keep authentication tokens, full email links, and database credentials out of alerts and tickets. Test an alert before admitting students.

The repository provides the release and recovery commands. Hosting, TLS, mail-domain verification, backup scheduling, external alerting, and a successful deployed email check remain operator setup steps.

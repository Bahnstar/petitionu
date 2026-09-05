# MVP verification

The implementation was developed in an isolated worktree based on `b4ad9aa`. The original workspace was preserved. Tests use disposable local PostgreSQL databases and synthetic accounts.

## Coverage

| Surface | Evidence |
| --- | --- |
| Account completion | Confirmed email, exact campus matching, names, optional graduation year, forged profile inputs, scoped role changes. |
| Participation privacy | Actor-owned creation and signatures, anonymous authors, private classrooms, hidden targets, same-campus admin and superadmin inverse-activity attacks, owner dashboard access. |
| Petition management | Edit settings, publish updates, close, mark victory, disabled comments, deadlines, duplicate signing, draft preservation and error recovery. |
| Classrooms | Code joining, pending/active/removed states, archived classrooms, professor-only TA changes, authorized invitations and safe roster names. |
| Moderation and support | Scoped reports, content snapshots, transactional hiding and audit rollback, support/deletion requests, manual operator resolution. |
| Operations | Required production config, configured mail adapter, release migration, HTTP 200/503 health checks, backup restoration, CI. |

The real browser scenario uses actual Phoenix authentication, local confirmation email, browser RPC, and stored data. It does not mock API responses. It disables the development auto-reload websocket so compilation cannot navigate a page during a check. Application LiveView connections remain active.

`assets/tests/master-audit.mjs` is a separate set of 21 browser regression checks with RPC fixtures. Those checks exercise controls, drafts, error recovery, and query refreshes. They do not prove database persistence.

## Reproduce

Use the toolchain and PostgreSQL setup in [deployment instructions](../deployment.md). Install frontend dependencies with `cd assets && bun install --frozen-lockfile`.

```sh
mix help precommit
mix precommit
(cd assets && ./node_modules/.bin/tsc --noEmit)
mix help assets.build
mix assets.build
python3 scripts/check-dependency-advisories.py
(cd assets && bun audit --json)
```

Install Playwright in a separate tools directory and run a local development server:

```sh
npm install --prefix /tmp/petitionu-playwright playwright@1.63.0
/tmp/petitionu-playwright/node_modules/.bin/playwright install chromium
mix help ash.setup
mix ash.setup
mix help run
mix run scripts/mvp-seed.exs
mix help phx.server
PORT=4001 mix phx.server
```

In another shell at the repository root:

```sh
BASE_URL=http://localhost:4001 PLAYWRIGHT_MODULE=/tmp/petitionu-playwright/node_modules/playwright node assets/tests/mvp.mjs
BASE_URL=http://localhost:4001 PLAYWRIGHT_MODULE=/tmp/petitionu-playwright/node_modules/playwright node assets/tests/master-audit.mjs
```

The fixture script refuses a nonlocal or production database. It maintains two named synthetic campuses and three operator accounts. The browser creates fresh student accounts for each run. It writes a JSON report to `/tmp/petitionu-mvp-browser-report.json` and screenshots to `docs/mvp/screenshots`. A failed run also preserves synthetic browser sessions under `/tmp` for diagnosis.

For release and restore checks, set `PGHOST`, `PGUSER`, and, if required, `PGPASSWORD` to a disposable PostgreSQL server:

```sh
scripts/build-release.sh
python3 scripts/release-smoke.py
scripts/backup-smoke.sh
python3 scripts/backup-restore-check.py petitionu_dev
```

The release check uses dummy mail credentials and sends no email. The data-restore check requires a quiet source database. It compares row counts, not every stored value.

## Recorded results

The final dependency-updated browser run `mtoygvia` passed all 13 scenarios. Its [JSON results](browser-results.json) and 12 desktop/mobile screenshots are committed. The 21 separate mocked UI checks also passed.

The integrated upgraded tree passed 94 backend tests, TypeScript, asset building, the 45-advisory check, and frontend audit. The dependency-updated release build succeeded in an isolated worktree with 154 matching runtime/build source files, including the generated client. The parent independently ran that package through repeated migrations, a healthy HTTP 200 response, and HTTP 503 with an explicit unreachable database URL.

The final backup check restored a real browser-populated application database. All nine table counts matched: 15 users, 5 petitions, 5 signatures, 5 comments, 2 classrooms, 4 memberships, 2 reports, 4 support requests, and 14 migrations. It used a separate temporary database and left the source intact.

Local checks used Elixir 1.20.3, OTP 29.0.5, and PostgreSQL 17.11. CI uses the versions pinned in its workflow and separately verifies the Linux release. Both formatter versions accept the committed layout.

## Launch limits

This work does not deploy the app or prove real Resend delivery. Hosting/TLS, sender verification, supported campus records, an initial operator, monitored support, scheduled off-host backups, and external alerts still require production setup. See [deployment](../deployment.md) and [moderation](../moderation.md). Account deletion is a persisted request with manual review. Email delivery is synchronous and has no outbox.

The [dependency check](dependency-security.md) covers the 45 reviewed advisories. It does not claim protection from unknown vulnerabilities.

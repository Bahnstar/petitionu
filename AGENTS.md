# Petitionu agent guide

## Working conventions

- Before writing Effect, RPC, SQL, queue or Better Auth code, or diagnosing an unexpected error in it, read [docs/agents/effect-and-better-auth.md](docs/agents/effect-and-better-auth.md). Effect is pinned at 4.0.6 and most examples online (and in training data) are v3; work from that doc and the installed source in `apps/server/node_modules/effect/src`.
- Pinned versions: `effect` and `@effect/*` exactly 4.0.6, `better-auth` exactly 1.7.14. Bun is the package manager (`bun.lock`, isolated linker: each package declares its own CLI devDependencies); the server runs on Node 24+.
- Run focused checks for the changed behaviour (`npx vitest run test/<file>` in `apps/server`), then `bun run precommit` before finishing. Report blockers and distinguish existing failures from regressions.
- Use Effect's `HttpClient` for server-side HTTP requests.

## Workspace

- `packages/domain`: the contract shared with the browser. Each area has one module with its RPC group, DTO and payload schemas; `Inputs.ts` and `Timestamps.ts` hold the shared payload and response field schemas; `Rpcs.ts` merges the groups into `AppRpcs`; `Client.ts` is the browser client (`makeApiClient`, `buildCSRFHeaders`, `reloadCSRFToken`).
- `apps/server`: the Effect server. Each area has its handler module (`Petitions.ts`); areas that make authorization decisions also have a policy module (`PetitionPolicy.ts`). Composition points take one line per area: `AppRpcs` in the domain, `RpcHandlers` in `src/Rpc.ts`, routes and layers in `src/App.ts`.
- `apps/web`: the React app. Shared primitives in `components/ui`; pages and features in `js/`.

Add a feature area as its own modules plus one line at each composition point, following an existing area.

## Procedures and authorization

- An area group ends with `.middleware(ActorMiddleware)`; `yield* CurrentActor` gives `Guest` or `SignedIn`. Sign-in-only procedures add `.middleware(RequireUser)` and read `yield* CurrentUser`. Procedures that create content use `requireParticipant` (confirmed email and complete profile) instead of `RequireUser`.
- Errors come from `packages/domain/src/Errors.ts`: `Unauthenticated`, `Forbidden`, `NotFound`, `Invalid({message, fields})`. A record the caller can't read is `NotFound`; readable but not permitted is `Forbidden`.
- In areas that make authorization decisions, the policy module holds read-scoping SQL fragments (`petitionVisible`, `petitionManageable`) and decision functions for writes. Scope every read and list through them.
- Check input in the payload schema with the shared schemas in `packages/domain/src/Inputs.ts`: `Uuid` for ids, `Note` and `OptionalNote` for text, with the area's length limit and wording. The shared client checks each payload before the call and reports a rejection as `invalid` entries, one per field, worded by the schema; the server checks again when it decodes, so handlers get checked, trimmed values. Add `.annotateRpcs(Rpc.ParseOptions, { errors: "all" })` to the group so the server reports every field too.
  - A malformed id is therefore `Invalid`, not `NotFound`, guests included. A page that takes an id from the URL checks it with `isUuid` first and shows its not-found view.
  - Keep in the handler only the checks a schema can't make (the database, the clock), failing with `Invalid` naming the field. An id stays a plain string only when the handler must answer a malformed one like an unknown one (join codes, reported content).
  - A caller that skips the shared client and sends a payload the schema rejects gets a generic defect, not a field error; the server logs the detail.
- `test/policy-matrix.test.ts` is the authorization contract: every procedure as every actor type. A new procedure, or a change to who may call one, gets a matrix row; the matrix fails when a procedure has none.

## Database

- Migrations live in `apps/server/src/migrations/000N_name.ts` (default export: an Effect) and are registered with one line in `src/Migrations.ts`. Never edit `0001_baseline.ts`: a test compares it to the production schema fixture.
- The Pg driver uses the extended protocol only: one statement per `sql.unsafe` call.
- Legacy Elixir-era objects (`tokens`, `users.hashed_password`, `oban_jobs`, Ecto's `schema_migrations`) stay until a follow-up drops them; leave them in place.

## Tests

Test at the seams, through behaviour:

- Seam A: HTTP requests against the in-process app (`makeTestApp`, `makeBrowser`, `createUser` in `apps/server/test/support/`) with a real, freshly migrated Postgres. Only the Mailer (`MemoryMailer`) and SchoolRegistry (`ScriptedSchoolRegistry`) are replaced.
- Seam B: draining the school verification queue (`makeJobsApp` in `test/support/jobs.ts`).

Tests never import policy modules, SQL helpers or DTO mappers. Use `it.live` for anything touching Postgres. The test database is the Docker container `petitionu-effect-pg` on 127.0.0.1:55432, started by Vitest's global setup (`TEST_DATABASE_URL` overrides it); schema-dump tests also need Docker.

## Web app

- Call procedures only through the shared client in `apps/web/lib/api.ts`, which keeps CSRF headers on every call. After any sign-in or sign-out, call the auth context's `afterAuthChange()` (reloads the CSRF token, then invalidates queries).
- Reuse existing UI components and Lucide icons. Build new styling with Tailwind and custom CSS, without adding daisyUI components or CSS `@apply`. Preserve Tailwind's import and source declarations in `apps/web/css/app.css`.
- For frontend changes, `bun run precommit` covers formatting, lint and the Vite build. See [docs/frontend-tooling.md](docs/frontend-tooling.md) for lint policy and vendored plugin maintenance.

## Deployment

One Docker image with three entry points (`apps/server/dist/serve.js`, `migrate.js`, `operator.js`), deployed with Compose or Railway. If build outputs move, update the Dockerfile, `compose.yaml`, `railway.json` and [docs/deployment.md](docs/deployment.md) together. Recovery and cutover scripts are in `scripts/` and documented there.

## Maintaining this file

Keep this guide limited to project conventions and pointers that affect implementation. Put API gotchas in `docs/agents/effect-and-better-auth.md` and product behaviour in the spec (`docs/specs/effect-backend-rewrite.md`) instead of inlining them here.

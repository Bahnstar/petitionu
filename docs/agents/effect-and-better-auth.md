# Effect 4 and Better Auth gotchas

Verified against `effect@4.0.6` and `better-auth@1.7.14` while building the server. Sources of truth: `apps/server/node_modules/effect/src/**`, the v4 examples inside the package (`apps/server/node_modules/effect/ai-docs/`) and `node_modules/better-auth/dist/**`. Read the source before trusting a v3-era example.

## Effect v3 to v4 renames

- `@effect/platform`, `@effect/rpc`, `@effect/sql` and `@effect/experimental` are now `effect/http`, `effect/rpc`, `effect/sql` and `effect/persistence`. Drivers stay separate: `@effect/sql-pg` (its own wire protocol, no `pg`) and `@effect/platform-node`.
- Services: `class X extends Context.Service<X, Shape>()("id") {}`, built with `X.of({...})` and `Layer.effect(X, effect)` (which also handles Scope; `Layer.scoped` is gone). Flags with a default: `Context.Reference`. `Layer.succeed(Tag)(impl)` is curried.
- `Effect.catchAll` is `Effect.catch`; `Effect.fork` is `Effect.forkChild`, `forkDaemon` is `forkDetach`; `Either` is `Result` (`Effect.result`); `Effect.async` is `Effect.callback`; `zipRight` is gone (`andThen`).
- Schema: `Schema.Union([...])` and `Schema.Literals([...])` take arrays; filters use `.check(...)`. `SqlSchema.findOne` fails with `NoSuchElementError`; `findOneOption` returns an Option.
- `HttpRouter` is a service plus layers (`add`, `serve`, `toWebHandler`). Mount fetch handlers with `HttpEffect.fromWebHandler`.

## HTTP and RPC

- `router.prefixed(...)` strips the prefix from `req.url`. Better Auth needs the full path, so it's mounted with `router.add("*", "/api/auth/*", ...)`.
- `RpcServer.layerHttp` defaults to WebSocket; the app passes `protocol: "http"` for `POST /rpc`.
- RPC middleware `headers` merge the HTTP headers with headers the client puts in the JSON body, and the body wins. CSRF, Origin and content-type checks therefore run in an `HttpRouter.middleware` on the real request (`src/Csrf.ts`), never in RPC middleware.
- `RpcClient.withHeaders` and the per-call `headers` option set message headers, not HTTP headers. Real HTTP headers (X-CSRF-Token) go through the client's fetch, as `makeApiClient` does.
- The raw `RpcClient` validates payloads before sending: a payload its schema rejects is a defect, not a typed error. The shared client (`makeApiClient` in `packages/domain/src/Client.ts`) encodes each payload against its schema first and answers a rejection itself, as `invalid` entries per field worded by the schema, without sending the call. A caller that skips the shared client and sends a payload the server's schema rejects gets a defect from the server's decode, before any handler runs. Payload schemas are strict (see AGENTS.md).
- Encoding starts from a schema's type side, so the type side must accept every value a form sends, and a check that should see what the user typed (e.g. a trimmed length) sits on the encoded side, before any decoding transformation; see `packages/domain/src/Inputs.ts`. A missing key's `messageMissingKey` is read from the encoded side when encoding and from the outer schema when decoding, so `Note` annotates both.

## SQL and the job queue

- One statement per `sql.unsafe` call (extended protocol only). `PgClient` connects lazily: a bad URL surfaces on the first query.
- The Pg driver reads `timestamp` columns as `Date`s, truncated to milliseconds. Response DTOs carry them as `Timestamp` or `Deadline` (`packages/domain/src/Timestamps.ts`), which encode the ISO strings, so queries select the columns as they are and decode rows against the DTO's type side (`Result: Schema.toType(PetitionDto)`).
- A `PersistedQueue` offer made inside `sql.withTransaction` joins that transaction, so queueing a job commits or rolls back with the write. Delivery is at least once: handlers must be idempotent. To cancel a job, complete it and log why; there's no cancel API.
- The SQL queue store uses the database clock, so `TestClock` can't advance it. Tests drive the queue through `test/support/jobs.ts` (`drain`, `elapse`). The verification job's 60-second deferral writes to the store's table directly, which an Effect upgrade could break.

## Tests

- `it.effect` runs on a fake clock that drives neither Postgres `now()` nor Better Auth's `Date.now()`; use `it.live` for anything touching them.
- `layer(...)` from `@effect/vitest` shares one built layer across a file; pass `excludeTestServices: true` when building it needs real sleeps (see the policy matrix).

## Better Auth

- Field and table names are mapped onto the existing schema in `src/Auth.ts` (`users`, `account`, `session`, `verification`, `rate_limit`). Existing users got a `credential` account holding their legacy bcrypt hash, so old passwords keep working.
- Hashing uses `bcryptjs` at cost 12: native addons can't load from the bundled image.
- Emailed links point at SPA pages (`/auth/confirm`, `/auth/magic`, `/reset`) built from the token, not Better Auth's URLs, because its verify URLs act on GET and mail scanners would consume them. The page calls the API when the user clicks.
- Password reset doesn't set `emailVerified`; the reset hook does. Confirmation (`UserConfirmed`) runs once per user, inside the transaction that sets `confirmed_at`.
- A magic-link sign-in by an unverified user deletes that user's password account and sessions (Better Auth's anti-takeover rule). The user then needs a password reset.
- Rate limits are per client address from `CLIENT_IP_HEADER`; without a resolvable address all clients share one bucket.
- Better Auth disables its origin check when `NODE_ENV=test`; the app sets `disableOriginCheck: false` so tests see production behaviour. Tests send `Origin` like a browser (`makeBrowser`).
- The session cookie is `better-auth.session_token` (with a `__Secure-` prefix on https). `getSession` doesn't refresh it; the web app calls `get-session` on load.

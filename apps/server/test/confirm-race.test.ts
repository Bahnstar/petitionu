import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp, type TestApp } from "./support/harness.ts"
import {
  clickConfirm,
  confirmWithPassword,
  defaultPassword,
  lastEmailedToken,
  registerUser,
  withEmailTo,
} from "./support/users.ts"

const newPassword = "a brand new passphrase"

/** How long after the attacker's sign-in starts the owner acts; bcrypt takes about 250 ms. */
const delays = [0, 5, 20, 50, 100, 150, 200, 250, 300]

/** Each way an owner proves an address, up to the request that does it. */
const proofs: Record<
  string,
  (app: TestApp, email: string) => Effect.Effect<Effect.Effect<unknown>>
> = {
  "a Confirm click": (app, email) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      return clickConfirm(app, browser, email, { removePassword: true })
    }),
  "a magic link": (app, email) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/sign-in/magic-link", { email }),
      )
      return browser.authGet(`/magic-link/verify?token=${encodeURIComponent(token)}`)
    }),
  "a password reset": (app, email) =>
    Effect.gen(function* () {
      const browser = yield* makeBrowser(app)
      const { token } = yield* withEmailTo(
        app,
        email,
        browser.auth("/request-password-reset", { email }),
      )
      return browser.auth("/reset-password", {
        token,
        newPassword,
        newPasswordConfirmation: newPassword,
      })
    }),
}

const sessions = (app: TestApp, userId: string) =>
  Effect.map(
    app.sql<{ count: number }>`
      SELECT count(*)::int AS count FROM session WHERE user_id = ${userId}
    `.pipe(Effect.orDie),
    ([row]) => row!.count,
  )

/** Records, in order, what happens to a user's password and sessions and when they're verified. */
const recordOrder = (app: TestApp) =>
  Effect.gen(function* () {
    for (const statement of [
      `CREATE TABLE test_events (id serial PRIMARY KEY, event text NOT NULL)`,
      `CREATE FUNCTION test_log() RETURNS trigger AS $$
       BEGIN
         INSERT INTO test_events (event) VALUES (TG_ARGV[0]);
         RETURN NULL;
       END $$ LANGUAGE plpgsql`,
      `CREATE TRIGGER test_locked AFTER INSERT ON verification FOR EACH ROW
       WHEN (NEW.identifier LIKE 'revoke-unproven-account-access:%')
       EXECUTE FUNCTION test_log('locked')`,
      `CREATE TRIGGER test_verified AFTER UPDATE ON users FOR EACH ROW
       WHEN (NOT OLD.email_verified AND NEW.email_verified) EXECUTE FUNCTION test_log('verified')`,
      `CREATE TRIGGER test_password_removed AFTER DELETE ON account FOR EACH ROW
       EXECUTE FUNCTION test_log('password removed')`,
      `CREATE TRIGGER test_password_changed AFTER UPDATE ON account FOR EACH ROW
       WHEN (OLD.password IS DISTINCT FROM NEW.password)
       EXECUTE FUNCTION test_log('password changed')`,
    ]) {
      yield* app.sql.unsafe(statement).pipe(Effect.orDie)
    }
    return app.sql<{ event: string }>`SELECT event FROM test_events ORDER BY id`.pipe(
      Effect.orDie,
      Effect.map((rows) => rows.map((row) => row.event)),
    )
  })

const slowRevocation = (app: TestApp, table: "account" | "session" = "account", seconds = 0.05) =>
  Effect.gen(function* () {
    for (const statement of [
      `CREATE FUNCTION test_slow() RETURNS trigger AS $$
       BEGIN
         PERFORM pg_sleep(${seconds});
         RETURN NULL;
       END $$ LANGUAGE plpgsql`,
      `CREATE TRIGGER test_slow BEFORE DELETE ON ${table}
       FOR EACH STATEMENT EXECUTE FUNCTION test_slow()`,
    ]) {
      yield* app.sql.unsafe(statement).pipe(Effect.orDie)
    }
  })

describe("a sign-in racing the owner's proof", () => {
  for (const [name, prepare] of Object.entries(proofs)) {
    it.live(
      `can't outlast ${name}, whenever it lands`,
      () =>
        Effect.gen(function* () {
          const app = yield* makeTestApp()
          for (const delay of delays) {
            const attacker = yield* registerUser(app)
            const proof = yield* prepare(app, attacker.email)
            const browser = yield* makeBrowser(app)

            const [signIn] = yield* Effect.all(
              [
                browser.auth("/sign-in/email", {
                  email: attacker.email,
                  password: defaultPassword,
                }),
                Effect.andThen(Effect.sleep(`${delay} millis`), proof),
              ],
              { concurrency: "unbounded" },
            )

            assert.include([401, 403], signIn.status, `at ${delay} ms`)
            assert.isUndefined(browser.cookie("session_token"), `at ${delay} ms`)
            // Only the owner's new session exists.
            assert.strictEqual(yield* sessions(app, attacker.id), 1, `at ${delay} ms`)
          }
        }),
      { timeout: 60_000 },
    )
  }
})

describe("the address counts as proved", () => {
  it.live("only after a Confirm click has removed the password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const events = yield* recordOrder(app)
      const user = yield* registerUser(app)
      yield* yield* proofs["a Confirm click"]!(app, user.email)
      assert.deepStrictEqual((yield* events).slice(0, 3), [
        "locked",
        "password removed",
        "verified",
      ])
    }),
  )

  // The same lock as removing it, so a concurrent click can't end the session this one starts.
  // bcrypt blocks this process, so a test can't overlap two clicks the way two servers would.
  it.live("under the same lock when a Confirm click keeps the password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const events = yield* recordOrder(app)
      const user = yield* registerUser(app)
      yield* confirmWithPassword(app, yield* makeBrowser(app), user.email)
      assert.deepStrictEqual((yield* events).slice(0, 2), ["locked", "verified"])
    }),
  )

  it.live("only after a magic link has removed the password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const events = yield* recordOrder(app)
      const user = yield* registerUser(app)
      yield* yield* proofs["a magic link"]!(app, user.email)
      assert.deepStrictEqual((yield* events).slice(0, 3), [
        "locked",
        "password removed",
        "verified",
      ])
    }),
  )

  it.live("only after a reset has replaced the password", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const events = yield* recordOrder(app)
      const user = yield* registerUser(app)
      yield* yield* proofs["a password reset"]!(app, user.email)
      assert.deepStrictEqual((yield* events).slice(0, 2), ["password changed", "verified"])
    }),
  )
})

describe("concurrent Confirm clicks", () => {
  // Without Better Auth's lock, a later click reads the user as unverified, then revokes after the
  // first click has created its session. Holding revocation open, with clicks arriving throughout,
  // makes that overlap happen rather than hoping for it.
  it.live(
    "never end a session one of them started",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        yield* slowRevocation(app)
        for (let round = 0; round < 6; round++) {
          const user = yield* registerUser(app)
          const browsers = yield* Effect.all(Array.from({ length: 10 }, () => makeBrowser(app)))

          const clicks = yield* Effect.all(
            browsers.map((browser, index) =>
              Effect.andThen(
                Effect.sleep(`${index * 6} millis`),
                clickConfirm(app, browser, user.email, { removePassword: true }),
              ),
            ),
            { concurrency: "unbounded" },
          )

          assert.isTrue(
            clicks.every((click) => click.status === 200),
            JSON.stringify(clicks.map((click) => click.status)),
          )
          const started = browsers.filter((browser) => browser.cookie("session_token"))
          assert.isNotEmpty(started)
          assert.strictEqual(yield* sessions(app, user.id), started.length, `round ${round}`)
        }
      }),
    { timeout: 60_000 },
  )

  // Better Auth's lock lasts 5 s, but a click stops waiting for it after 2 s.
  it.live(
    "that keep the password all succeed when the first holds the lock for a while",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        yield* slowRevocation(app, "session", 3.5)
        const user = yield* registerUser(app)
        const token = yield* lastEmailedToken(app, user.email)
        const browsers = yield* Effect.all([makeBrowser(app), makeBrowser(app)])

        const clicks = yield* Effect.all(
          browsers.map((browser, index) =>
            Effect.andThen(
              Effect.sleep(`${index * 500} millis`),
              browser.confirmWithPassword(token, user.password),
            ),
          ),
          { concurrency: "unbounded" },
        )

        assert.deepStrictEqual(
          clicks.map((click) => click.status),
          [200, 200],
        )
        assert.strictEqual(yield* sessions(app, user.id), 2)
      }),
    { timeout: 60_000 },
  )
})

const credentials = (app: TestApp, userId: string) =>
  Effect.map(
    app.sql<{ count: number }>`
      SELECT count(*)::int AS count FROM account
      WHERE user_id = ${userId} AND provider_id = 'credential'
    `.pipe(Effect.orDie),
    ([row]) => row!.count,
  )

const verified = (app: TestApp, userId: string) =>
  Effect.map(
    app.sql<{ verified: boolean }>`
      SELECT email_verified AS verified FROM users WHERE id = ${userId}
    `.pipe(Effect.orDie),
    ([row]) => row!.verified,
  )

const passwordSignIn = (app: TestApp, user: { email: string; password: string }) =>
  Effect.gen(function* () {
    const browser = yield* makeBrowser(app)
    const response = yield* browser.auth("/sign-in/email", {
      email: user.email,
      password: user.password,
    })
    return { browser, status: response.status }
  })

const lockRows = `identifier LIKE 'revoke-unproven-account-access:%'`

/** Waits for a click to hold Better Auth's lock: how long that takes depends on bcrypt. */
const lockTaken: (app: TestApp) => Effect.Effect<void> = (app) =>
  Effect.gen(function* () {
    const rows = yield* app.sql
      .unsafe(`SELECT 1 FROM verification WHERE ${lockRows}`)
      .pipe(Effect.orDie)
    if (rows.length > 0) return
    yield* Effect.sleep("10 millis")
    yield* lockTaken(app)
  })

/**
 * Runs `click` as a process killed mid-confirmation would: it fails before changing anything, and
 * Better Auth's lock stays behind, live for another minute.
 */
const crashes = (app: TestApp, click: Effect.Effect<unknown>) =>
  Effect.gen(function* () {
    for (const statement of [
      `CREATE FUNCTION test_keep_lock() RETURNS trigger AS $$ BEGIN RETURN NULL; END $$
       LANGUAGE plpgsql`,
      `CREATE TRIGGER test_keep_lock BEFORE DELETE ON verification FOR EACH ROW
       WHEN (OLD.${lockRows}) EXECUTE FUNCTION test_keep_lock()`,
      `CREATE FUNCTION test_crash() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'crash'; END $$
       LANGUAGE plpgsql`,
      `CREATE TRIGGER test_crash_account BEFORE DELETE ON account
       FOR EACH STATEMENT EXECUTE FUNCTION test_crash()`,
      `CREATE TRIGGER test_crash_session BEFORE DELETE ON session
       FOR EACH STATEMENT EXECUTE FUNCTION test_crash()`,
    ]) {
      yield* app.sql.unsafe(statement).pipe(Effect.orDie)
    }
    yield* click
    for (const statement of [
      `DROP TRIGGER test_crash_account ON account`,
      `DROP TRIGGER test_crash_session ON session`,
      `DROP TRIGGER test_keep_lock ON verification`,
      `UPDATE verification SET expires_at = now() at time zone 'utc' + interval '1 minute'
       WHERE ${lockRows}`,
    ]) {
      yield* app.sql.unsafe(statement).pipe(Effect.orDie)
    }
  })

describe("a click that loses Better Auth's lock", () => {
  // The holder stalls for 3 s, a click gives up waiting after 2 s, and a sign-in that reads the
  // password late in the stall would finish after the holder had revoked sessions.
  it.live(
    "doesn't confirm while the holder is removing the password",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        yield* slowRevocation(app, "account", 3)
        for (const start of [2800, 2900, 3000]) {
          const user = yield* registerUser(app)
          const [holder, loser, attacker] = yield* Effect.all([
            makeBrowser(app),
            makeBrowser(app),
            makeBrowser(app),
          ])

          const [held, lost, signIn] = yield* Effect.all(
            [
              clickConfirm(app, holder, user.email, { removePassword: true }),
              Effect.andThen(
                lockTaken(app),
                clickConfirm(app, loser, user.email, { removePassword: true }),
              ),
              Effect.andThen(
                Effect.sleep(`${start} millis`),
                attacker.auth("/sign-in/email", {
                  email: user.email,
                  password: user.password,
                }),
              ),
            ],
            { concurrency: "unbounded" },
          )

          assert.strictEqual(lost.status, 503, `at ${start} ms`)
          assert.notProperty(lost.body, "passwordRemoved")
          assert.isUndefined(loser.cookie("session_token"))
          assert.strictEqual(held.status, 200)
          assert.isTrue(held.body.passwordRemoved)
          assert.include([401, 403], signIn.status, `at ${start} ms`)
          assert.isUndefined(attacker.cookie("session_token"), `at ${start} ms`)
          assert.strictEqual(yield* credentials(app, user.id), 0)
          assert.strictEqual(yield* sessions(app, user.id), 1)
        }
      }),
    { timeout: 60_000 },
  )

  it.live(
    "after a crash stays unconfirmed, keeps nothing open, and works once the lock has gone",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const user = yield* registerUser(app)
        const owner = yield* makeBrowser(app)
        const remove = clickConfirm(app, owner, user.email, { removePassword: true })
        yield* crashes(app, remove)

        const retry = yield* remove
        assert.strictEqual(retry.status, 503)
        assert.notProperty(retry.body, "passwordRemoved")
        assert.isFalse(yield* verified(app, user.id))
        assert.strictEqual(yield* credentials(app, user.id), 1)
        assert.strictEqual((yield* passwordSignIn(app, user)).status, 403)

        yield* app.sql
          .unsafe(
            `UPDATE verification SET expires_at = now() at time zone 'utc' - interval '1 second'
             WHERE ${lockRows}`,
          )
          .pipe(Effect.orDie)
        // Better Auth clears an expired lock for the next click, not this one.
        yield* remove
        const after = yield* remove
        assert.strictEqual(after.status, 200)
        assert.isTrue(after.body.passwordRemoved)
        assert.strictEqual(yield* credentials(app, user.id), 0)
        assert.strictEqual((yield* passwordSignIn(app, user)).status, 401)
      }),
    { timeout: 60_000 },
  )

  it.live(
    "with the right password starts no session unless the user ended up confirmed",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        const user = yield* registerUser(app)
        const owner = yield* makeBrowser(app)
        yield* crashes(app, confirmWithPassword(app, owner, user.email))

        const response = yield* confirmWithPassword(app, owner, user.email)

        assert.strictEqual(response.status, 503)
        assert.isUndefined(owner.cookie("session_token"))
        assert.strictEqual(yield* sessions(app, user.id), 0)
        assert.isFalse(yield* verified(app, user.id))
      }),
    { timeout: 60_000 },
  )

  it.live(
    "doesn't claim a password was removed when a click keeping it won",
    () =>
      Effect.gen(function* () {
        const app = yield* makeTestApp()
        yield* slowRevocation(app, "session", 0.6)
        const user = yield* registerUser(app)
        const [keeper, remover] = yield* Effect.all([makeBrowser(app), makeBrowser(app)])

        const [kept, removed] = yield* Effect.all(
          [
            confirmWithPassword(app, keeper, user.email),
            Effect.andThen(
              lockTaken(app),
              clickConfirm(app, remover, user.email, { removePassword: true }),
            ),
          ],
          { concurrency: "unbounded" },
        )

        assert.strictEqual(kept.status, 200)
        assert.strictEqual(removed.status, 200)
        assert.strictEqual(yield* credentials(app, user.id), 1)
        assert.notProperty(removed.body, "passwordRemoved")
      }),
    { timeout: 60_000 },
  )
})

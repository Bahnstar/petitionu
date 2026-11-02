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

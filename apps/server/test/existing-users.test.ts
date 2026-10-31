import { PgClient } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { migrations, runMigrationsFrom } from "../src/Migrations.ts"
import { makeBrowser } from "./support/browser.ts"
import { makeTestApp, makeTestDatabase, migrateDatabase } from "./support/harness.ts"

// bcrypt (cost 12) of "correct horse", made with pgcrypto and given bcrypt_elixir's `$2b$` prefix.
const legacyHash = "$2b$12$HR.rOsPTSGRv0FtOB2LEE.K5.EuYF1upCel.uAumpOye5knTEs12m"

/** A database as it is before the rewrite (the baseline), with users created by the old app. */
const legacyDatabase = Effect.gen(function* () {
  const database = yield* makeTestDatabase
  yield* Effect.gen(function* () {
    yield* runMigrationsFrom({ "0001_baseline": migrations["0001_baseline"] })
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO users (email, hashed_password, confirmed_at, first_name)
      VALUES ('ada@example.edu', ${legacyHash}, now() AT TIME ZONE 'utc', 'Ada'),
        ('bea@example.edu', ${legacyHash}, NULL, 'Bea'),
        ('cy@example.edu', NULL, now() AT TIME ZONE 'utc', 'Cy')
    `
  }).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(database.url), maxConnections: 1 })),
    Effect.orDie,
  )
  yield* migrateDatabase(database.url)
  return database
})

describe("users from before the rewrite", () => {
  it.live("sign in with their existing password and keep their confirmation", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp({ database: yield* legacyDatabase })
      for (const [email, confirmed] of [
        ["ada@example.edu", true],
        ["bea@example.edu", false],
      ] as const) {
        const browser = yield* makeBrowser(app)
        const wrong = yield* browser.auth("/sign-in/email", { email, password: "wrong horse" })
        assert.strictEqual(wrong.status, 401)
        const response = yield* browser.auth("/sign-in/email", { email, password: "correct horse" })
        assert.strictEqual(response.status, 200, email)
        yield* browser.reloadCsrf
        const me = yield* browser.rpc((api) => api.getMe())
        if (!me.success) return assert.fail(JSON.stringify(me))
        assert.strictEqual(me.data.email, email)
        assert.strictEqual(me.data.emailVerified, confirmed)
      }
      const passwordless = yield* (yield* makeBrowser(app)).auth("/sign-in/email", {
        email: "cy@example.edu",
        password: "correct horse",
      })
      assert.strictEqual(passwordless.status, 401)
    }),
  )
})

import { PgClient } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { runMigrations } from "../src/Migrations.ts"
import { makeTestDatabase } from "./support/harness.ts"
import { dumpSchema, normalizeDump, readFixture, runPsql } from "./support/postgres-tools.ts"

const migrate = (url: string) =>
  runMigrations.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })))

const query = (url: string, statement: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.unsafe(statement)
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })))

const ectoVersions = (url: string) =>
  query(url, "SELECT version::text FROM schema_migrations ORDER BY version").pipe(
    Effect.map((rows) => rows.map((row) => String(row.version))),
  )

/** A database in the state production is in: Ecto's schema, its migration rows and data. */
const seedEctoDatabase = (url: string, versions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* runPsql(url, yield* readFixture("schema.sql"))
    yield* runPsql(
      url,
      `INSERT INTO schema_migrations (version, inserted_at) VALUES ${versions
        .map((version) => `(${version}, '2026-09-08 05:00:00')`)
        .join(", ")};
       INSERT INTO users (email, hashed_password) VALUES ('ada@example.edu', '$2b$12$hash');`,
    )
  })

const fixtureVersions = readFixture("ecto-schema-migrations.txt").pipe(
  Effect.map((text) => text.trim().split("\n")),
)

describe("migrations", () => {
  it.live("create the current Ecto schema on an empty database", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      const applied = yield* migrate(database.url)
      assert.deepStrictEqual(
        applied.map(([id]) => id),
        [1],
      )
      const dump = yield* dumpSchema(database.url)
      assert.strictEqual(normalizeDump(dump), normalizeDump(yield* readFixture("schema.sql")))
      assert.deepStrictEqual(yield* ectoVersions(database.url), yield* fixtureVersions)
    }),
  )

  it.live("do nothing when run a second time", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      yield* migrate(database.url)
      const before = normalizeDump(yield* dumpSchema(database.url))
      const applied = yield* migrate(database.url)
      assert.deepStrictEqual(applied, [])
      assert.strictEqual(normalizeDump(yield* dumpSchema(database.url)), before)
      assert.deepStrictEqual(yield* ectoVersions(database.url), yield* fixtureVersions)
    }),
  )

  it.live("leave a database migrated by Ecto untouched", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      const versions = yield* fixtureVersions
      yield* seedEctoDatabase(database.url, versions)
      const before = normalizeDump(yield* dumpSchema(database.url))

      const applied = yield* migrate(database.url)

      assert.deepStrictEqual(applied, [[1, "baseline"]])
      assert.strictEqual(normalizeDump(yield* dumpSchema(database.url)), before)
      const rows = yield* query(
        database.url,
        "SELECT (SELECT count(*)::int FROM schema_migrations WHERE inserted_at = '2026-09-08 05:00:00') AS migrations, (SELECT count(*)::int FROM users) AS users",
      )
      assert.deepStrictEqual(rows, [{ migrations: versions.length, users: 1 }])
      assert.deepStrictEqual(yield* migrate(database.url), [])
    }),
  )

  it.live("refuse a database whose Ecto migrations stopped early", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      yield* seedEctoDatabase(database.url, (yield* fixtureVersions).slice(0, -1))
      const exit = yield* migrate(database.url).pipe(Effect.exit)
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "Ecto migrations are incomplete")
    }),
  )
})

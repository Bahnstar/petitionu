import { PgClient } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { runMigrations } from "../src/Migrations.ts"
import { makeTestDatabase } from "./support/harness.ts"
import { dumpSchema, normalizeDump, readFixture } from "./support/postgres-tools.ts"

const migrate = (url: string) =>
  runMigrations.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })))

const ectoVersions = (url: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ version: string }>`SELECT version::text FROM schema_migrations ORDER BY version`
    return rows.map((row) => row.version)
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })))

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
})

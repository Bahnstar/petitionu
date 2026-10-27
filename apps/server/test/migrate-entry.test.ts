import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { dropDatabase, makeTestDatabase } from "./support/harness.ts"

const entryPoint = fileURLToPath(new URL("../src/migrate.ts", import.meta.url))

/** Runs the `migrate` entry point as its own process, as the deploy's migrate step does. */
const runMigrate = (databaseUrl: string) =>
  Effect.callback<{ readonly code: number; readonly output: string }>((resume) => {
    execFile(
      process.execPath,
      [entryPoint],
      { env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl } },
      (error, stdout, stderr) =>
        resume(
          Effect.succeed({ code: error ? Number(error.code ?? 1) : 0, output: stdout + stderr }),
        ),
    )
  })

describe("migrate entry point", () => {
  it.live("applies pending migrations and exits 0, then again with nothing to do", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      const first = yield* runMigrate(database.url)
      assert.strictEqual(first.code, 0, first.output)
      assert.include(first.output, "baseline")
      const second = yield* runMigrate(database.url)
      assert.strictEqual(second.code, 0, second.output)
      assert.include(second.output, "No pending migrations")
    }),
  )

  it.live("exits non-zero when the database can't be migrated", () =>
    Effect.gen(function* () {
      const database = yield* makeTestDatabase
      yield* dropDatabase(database.name)
      const result = yield* runMigrate(database.url)
      assert.notStrictEqual(result.code, 0)
    }),
  )
})

import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { dropDatabase, makeTestApp } from "./support/harness.ts"

describe("GET /healthz", () => {
  it.live("reports ok when the database answers", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      const response = yield* app.request("/healthz")
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* Effect.promise(() => response.json()), { status: "ok" })
    }),
  )

  it.live("reports 503 without details when the database is gone", () =>
    Effect.gen(function* () {
      const app = yield* makeTestApp()
      yield* dropDatabase(app.database.name)
      const response = yield* app.request("/healthz")
      assert.strictEqual(response.status, 503)
      const body = yield* Effect.promise(() => response.text())
      assert.deepStrictEqual(JSON.parse(body), { status: "unavailable" })
      assert.notInclude(body, app.database.name)
    }),
  )
})

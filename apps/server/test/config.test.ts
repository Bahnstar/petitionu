import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { makeAppLayer } from "../src/App.ts"

const startWith = (env: Record<string, string>) =>
  Layer.build(
    makeAppLayer().pipe(
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
      Layer.provide([HttpRouter.layer, NodeHttpServer.layerHttpServices]),
    ),
  ).pipe(Effect.scoped, Effect.exit)

describe("startup configuration", () => {
  it.live("starts with only DATABASE_URL set", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" })
      assert.isTrue(Exit.isSuccess(exit), String(exit))
    }),
  )

  it.live("refuses to start without DATABASE_URL", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({})
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "DATABASE_URL")
    }),
  )

  it.live("refuses to start with an invalid PORT", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x", PORT: "abc" })
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "PORT")
    }),
  )
})

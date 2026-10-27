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

const secrets = {
  BETTER_AUTH_SECRET: "a-better-auth-secret-of-at-least-32-chars",
  CSRF_SECRET: "a-csrf-secret-of-at-least-32-characters!",
}

describe("startup configuration", () => {
  it.live("starts with only DATABASE_URL and the two secrets set", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x", ...secrets })
      assert.isTrue(Exit.isSuccess(exit), String(exit))
    }),
  )

  for (const name of ["BETTER_AUTH_SECRET", "CSRF_SECRET"] as const) {
    it.live(`refuses to start without a ${name} of at least 32 characters`, () =>
      Effect.gen(function* () {
        for (const value of [undefined, "too-short"]) {
          const env: Record<string, string> = {
            DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
            ...secrets,
          }
          if (value === undefined) delete env[name]
          else env[name] = value
          const exit = yield* startWith(env)
          assert.isTrue(Exit.isFailure(exit))
          assert.include(String(exit), name)
        }
      }),
    )
  }

  it.live("refuses to start without DATABASE_URL", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({})
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "DATABASE_URL")
    }),
  )

  it.live("refuses to start with an invalid PORT", () =>
    Effect.gen(function* () {
      const exit = yield* startWith({
        DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
        PORT: "abc",
        ...secrets,
      })
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "PORT")
    }),
  )
})

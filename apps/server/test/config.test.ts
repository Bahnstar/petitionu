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
  RESEND_API_KEY: "re_secret",
  MAIL_FROM: "mail@campus.test",
  SUPPORT_EMAIL: "help@campus.test",
  PUBLIC_HOST: "petition.campus.edu",
}

const database = { DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" }

describe("startup configuration", () => {
  it.live(
    "starts with only DATABASE_URL, PUBLIC_HOST, the secrets and the mail addresses set",
    () =>
      Effect.gen(function* () {
        const exit = yield* startWith({ ...database, ...secrets })
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

  it.live("refuses to start in production without RESEND_API_KEY", () =>
    Effect.gen(function* () {
      const { RESEND_API_KEY: _, ...withoutKey } = secrets
      for (const env of [{}, { NODE_ENV: "production" }, { NODE_ENV: "test" }]) {
        const exit = yield* startWith({
          DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
          ...withoutKey,
          ...env,
        })
        assert.isTrue(Exit.isFailure(exit))
        assert.include(String(exit), "RESEND_API_KEY")
      }
    }),
  )

  it.live("starts in development without RESEND_API_KEY", () =>
    Effect.gen(function* () {
      const { RESEND_API_KEY: _, ...withoutKey } = secrets
      const exit = yield* startWith({
        DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
        NODE_ENV: "development",
        ...withoutKey,
      })
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
      const exit = yield* startWith({
        DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
        PORT: "abc",
        ...secrets,
      })
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(exit), "PORT")
    }),
  )

  it.live("refuses to start in production without PUBLIC_HOST", () =>
    Effect.gen(function* () {
      const { PUBLIC_HOST: _, ...withoutHost } = secrets
      for (const env of [
        {},
        { NODE_ENV: "production" },
        { NODE_ENV: "production", PUBLIC_HOST: "" },
      ]) {
        const exit = yield* startWith({ ...database, ...withoutHost, ...env })
        assert.isTrue(Exit.isFailure(exit))
        assert.include(String(exit), "PUBLIC_HOST")
      }
    }),
  )

  it.live("starts in development and test without PUBLIC_HOST", () =>
    Effect.gen(function* () {
      const { PUBLIC_HOST: _, ...withoutHost } = secrets
      for (const NODE_ENV of ["development", "test"]) {
        const exit = yield* startWith({ ...database, ...withoutHost, NODE_ENV })
        assert.isTrue(Exit.isSuccess(exit), String(exit))
      }
    }),
  )

  it.live("refuses a PUBLIC_HOST with a scheme, a path or whitespace, and accepts a port", () =>
    Effect.gen(function* () {
      for (const PUBLIC_HOST of [
        "https://petition.campus.edu",
        "petition.campus.edu/app",
        "petition campus.edu",
        " petition.campus.edu",
      ]) {
        for (const NODE_ENV of ["production", "development"]) {
          const exit = yield* startWith({ ...database, ...secrets, NODE_ENV, PUBLIC_HOST })
          assert.isTrue(Exit.isFailure(exit), `${NODE_ENV} accepted ${JSON.stringify(PUBLIC_HOST)}`)
          assert.include(String(exit), "PUBLIC_HOST")
        }
      }
      const exit = yield* startWith({ ...database, ...secrets, PUBLIC_HOST: "localhost:5173" })
      assert.isTrue(Exit.isSuccess(exit), String(exit))
    }),
  )
})

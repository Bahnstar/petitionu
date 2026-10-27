import { NodeHttpServer } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { ConfigProvider, Effect, Layer, Redacted, type Scope } from "effect"
import { HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { fileURLToPath } from "node:url"
import { makeAppLayer } from "../../src/App.ts"
import { runMigrations } from "../../src/Migrations.ts"

const adminUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:55432/postgres"

export const fixtureWebDist = fileURLToPath(new URL("../fixtures/web-dist", import.meta.url))

const withAdmin = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  effect.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(adminUrl), maxConnections: 1 })))

const databaseUrlFor = (name: string) => {
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return url.toString()
}

/** Drops a test database, disconnecting anything still using it. */
export const dropDatabase = (name: string) =>
  withAdmin(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    }),
  ).pipe(Effect.orDie)

/** Creates a uniquely named database on the test Postgres, dropped when the scope closes. */
export const makeTestDatabase: Effect.Effect<
  { readonly name: string; readonly url: string },
  never,
  Scope.Scope
> = Effect.acquireRelease(
  withAdmin(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const name = `petitionu_test_${crypto.randomUUID().replaceAll("-", "")}`
      yield* sql.unsafe(`CREATE DATABASE "${name}"`)
      return { name, url: databaseUrlFor(name) }
    }),
  ).pipe(Effect.orDie),
  ({ name }) => dropDatabase(name),
)

export interface TestApp {
  readonly database: { readonly name: string; readonly url: string }
  readonly request: (path: string, init?: RequestInit) => Effect.Effect<Response>
}

/** Applies the real migrations to a database, as the deploy's migrate step does. */
export const migrateDatabase = (url: string) =>
  runMigrations.pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })),
    Effect.orDie,
  )

/** A fresh test database with every migration applied, dropped when the scope closes. */
export const makeMigratedTestDatabase = Effect.tap(makeTestDatabase, ({ url }) => migrateDatabase(url))

/**
 * Builds the composed app as an in-process web handler (Seam A), pointed at a fresh, migrated
 * database.
 * `env` overrides configuration variables.
 */
export const makeTestApp = (options: { readonly env?: Record<string, string> } = {}) =>
  Effect.gen(function* () {
    const database = yield* makeMigratedTestDatabase
    const config = ConfigProvider.fromUnknown({
      DATABASE_URL: database.url,
      WEB_DIST_DIR: fixtureWebDist,
      ...options.env,
    })
    const app = makeAppLayer().pipe(
      Layer.provide(ConfigProvider.layer(config)),
      Layer.provide(NodeHttpServer.layerHttpServices),
    )
    const { handler } = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      ({ dispose }) => Effect.promise(dispose),
    )
    const request = (path: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(new URL(path, "http://petitionu.test"), init)))
    return { database, request } satisfies TestApp
  })

import { NodeHttpServer } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { Cause, ConfigProvider, Context, Effect, Layer, Logger, Redacted, type Scope } from "effect"
import { HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { type AppServiceTypes, type BaseServiceTypes, makeAppLayer } from "../../src/App.ts"
import { runMigrations } from "../../src/Migrations.ts"
import { ExternalServicesTest, MemoryMailer, ScriptedSchoolRegistry } from "./external.ts"

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

/** Applies the real migrations to a database, as the deploy's migrate step does. */
export const migrateDatabase = (url: string) =>
  runMigrations.pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })),
    Effect.orDie,
  )

/** A fresh test database with every migration applied, dropped when the scope closes. */
export const makeMigratedTestDatabase = Effect.tap(makeTestDatabase, ({ url }) =>
  migrateDatabase(url),
)

/** The public origin tests use: `PUBLIC_HOST` is `petitionu.test`. */
export const testOrigin = "https://petitionu.test"

/** Configuration every test app gets; `makeTestApp({ env })` overrides it. */
export const testEnv = {
  PUBLIC_HOST: "petitionu.test",
  BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
  CSRF_SECRET: "test-csrf-secret-0123456789abcdef0123456789",
  // Tests drain the school verification queue themselves (see `jobs.ts`).
  JOB_WORKERS: "false",
}

const appConfigProvider = (databaseUrl: string, env?: Record<string, string>) =>
  ConfigProvider.fromUnknown({
    DATABASE_URL: databaseUrl,
    WEB_DIST_DIR: fixtureWebDist,
    ...testEnv,
    ...env,
  })

/** Appends each log's message and cause to `lines`. */
const captureLogs = (lines: Array<string>) =>
  Logger.layer([
    Logger.make(({ cause, message }) => {
      lines.push(`${JSON.stringify(message)} ${Cause.pretty(cause)}`)
    }),
  ])

export interface TestApp {
  readonly database: { readonly name: string; readonly url: string }
  /** Sends one request to the app, as is. Use `makeBrowser` for cookies and CSRF. */
  readonly request: (path: string, init?: RequestInit) => Effect.Effect<Response>
  /** The in-memory mailer the app sends through. */
  readonly mailer: MemoryMailer["Service"]
  /** The scripted school registry the app looks schools up in. */
  readonly registry: ScriptedSchoolRegistry["Service"]
  /** A connection to the app's database, for test setup. */
  readonly sql: SqlClient.SqlClient
  /** What the app has logged, one string per line. */
  readonly logs: ReadonlyArray<string>
}

/**
 * Builds the composed app as an in-process web handler (Seam A), pointed at a fresh, migrated
 * database, with the in-memory Mailer and scripted SchoolRegistry.
 * - `env` overrides configuration variables;
 * - `database` uses an existing (already migrated) database instead of a fresh one;
 * - `routes` adds router layers, e.g. a test-only RPC group;
 * - `userConfirmed` replaces what runs when a user becomes confirmed.
 */
export const makeTestApp = (
  options: {
    readonly env?: Record<string, string>
    readonly database?: { readonly name: string; readonly url: string }
    readonly routes?: Layer.Layer<never, never, HttpRouter.HttpRouter | AppServiceTypes>
    readonly userConfirmed?: Layer.Layer<never, unknown, BaseServiceTypes>
  } = {},
) =>
  Effect.gen(function* () {
    const database = options.database ?? (yield* makeMigratedTestDatabase)
    const config = appConfigProvider(database.url, options.env)
    const logs: Array<string> = []
    const external = yield* Layer.build(ExternalServicesTest)
    const sql = Context.get(
      yield* Layer.build(PgClient.layer({ url: Redacted.make(database.url), maxConnections: 2 })),
      SqlClient.SqlClient,
    )
    const app = makeAppLayer({
      external: Layer.succeedContext(external),
      ...(options.routes ? { routes: options.routes } : {}),
      ...(options.userConfirmed ? { userConfirmed: options.userConfirmed } : {}),
    }).pipe(
      Layer.provide(ConfigProvider.layer(config)),
      Layer.provide(NodeHttpServer.layerHttpServices),
    )
    const { handler } = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      ({ dispose }) => Effect.promise(dispose),
    )
    const logging = yield* Layer.build(captureLogs(logs))
    const request = (path: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(new URL(path, testOrigin), init), logging))
    return {
      database,
      request,
      mailer: Context.get(external, MemoryMailer),
      registry: Context.get(external, ScriptedSchoolRegistry),
      sql,
      logs,
    } satisfies TestApp
  })

/**
 * Serves the composed app on a real Node HTTP server, listening on the Unix socket at `path`,
 * until the scope closes. For behaviour the in-process handler can't show: Node's request
 * stream and connection handling. Send requests with `node:http` and `socketPath`.
 */
export const serveOnSocket = (path: string) =>
  Effect.gen(function* () {
    const database = yield* makeMigratedTestDatabase
    yield* Layer.build(
      HttpRouter.serve(makeAppLayer({ external: ExternalServicesTest }), {
        disableLogger: true,
      }).pipe(
        Layer.provide(NodeHttpServer.layer(createServer, { path })),
        Layer.provide(ConfigProvider.layer(appConfigProvider(database.url))),
      ),
    )
  })

import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, String as Str } from "effect"
import { AppConfig } from "./Config.ts"

/**
 * The most rows a list procedure returns. A list the web app treats as the complete set stays
 * uncapped until the work behind it moves to the server: a cap would silently cut it short.
 */
export const maxListRows = 250

/** The Postgres pool, provided as both `PgClient` and `SqlClient`. */
export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    return PgClient.layer({
      url: config.databaseUrl,
      ssl: config.databaseSsl,
      maxConnections: config.poolSize,
      transformQueryNames: Str.camelToSnake,
      transformResultNames: Str.snakeToCamel,
    })
  }),
)

import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, String as Str } from "effect"
import { AppConfig } from "./Config.ts"

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

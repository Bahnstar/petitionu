import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"

/** `GET /healthz`: 200 when the database answers `SELECT 1`, otherwise 503 without details. */
export const HealthRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const sql = yield* SqlClient.SqlClient
    const check = sql`SELECT 1`.pipe(
      Effect.timeout("5 seconds"),
      Effect.as(HttpServerResponse.jsonUnsafe({ status: "ok" })),
      Effect.catch((error) =>
        Effect.logWarning("Health check failed", error).pipe(
          Effect.as(HttpServerResponse.jsonUnsafe({ status: "unavailable" }, { status: 503 })),
        ),
      ),
      Effect.withSpan("healthz"),
    )
    yield* router.add("GET", "/healthz", check)
  }),
)

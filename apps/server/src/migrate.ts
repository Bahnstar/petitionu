/**
 * `migrate` entry point: applies pending database migrations once, then exits.
 * Exits non-zero when a migration fails, so the deploy stops before the app starts.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { AppConfig } from "./Config.ts"
import { DatabaseLive } from "./Database.ts"
import { ObservabilityLive } from "./Logging.ts"
import { runMigrations } from "./Migrations.ts"

runMigrations.pipe(
  Effect.tap((applied) =>
    applied.length === 0
      ? Effect.logInfo("No pending migrations")
      : Effect.logInfo(
          "Applied migrations",
          applied.map(([id, name]) => `${id}_${name}`),
        ),
  ),
  Effect.provide(DatabaseLive),
  Effect.provide(AppConfig.layer({ webDistDir: "" })),
  Effect.provide(ObservabilityLive),
  NodeRuntime.runMain,
)

import { Migrator } from "effect/sql"
import baseline from "./migrations/0001_baseline.ts"
import betterAuth from "./migrations/0002_better_auth.ts"
import jobQueue from "./migrations/0003_job_queue.ts"
import commentDeletedAt from "./migrations/0004_comment_deleted_at.ts"

/** The Effect migrator's own table. Ecto's `schema_migrations` stays frozen. */
export const migrationsTable = "petitionu_migrations"

/** Migrations are imported statically so they survive bundling into `dist/migrate.js`. */
export const migrations = {
  "0001_baseline": baseline,
  "0002_better_auth": betterAuth,
  "0003_job_queue": jobQueue,
  "0004_comment_deleted_at": commentDeletedAt,
}

/** Applies pending migrations from `records` in one locked transaction; returns the ones it ran. */
export const runMigrationsFrom = (
  records: Record<string, (typeof migrations)[keyof typeof migrations]>,
) => Migrator.make({})({ loader: Migrator.fromRecord(records), table: migrationsTable })

/** Applies every pending migration in one locked transaction; returns the ones it ran. */
export const runMigrations = runMigrationsFrom(migrations)

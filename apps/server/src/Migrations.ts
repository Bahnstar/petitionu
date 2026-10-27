import { Migrator } from "effect/sql"
import baseline from "./migrations/0001_baseline.ts"

/** The Effect migrator's own table. Ecto's `schema_migrations` stays frozen. */
export const migrationsTable = "petitionu_migrations"

/** Migrations are imported statically so they survive bundling into `dist/migrate.js`. */
const loader = Migrator.fromRecord({
  "0001_baseline": baseline,
})

/** Applies pending migrations in one locked transaction; returns the ones it ran. */
export const runMigrations = Migrator.make({})({ loader, table: migrationsTable })

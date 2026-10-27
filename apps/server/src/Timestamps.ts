import type { SqlClient } from "effect/sql"

/**
 * A timestamp column as the ISO 8601 UTC string the DTOs carry, with microseconds:
 * `sql\`SELECT ${isoTimestamp(sql, "p.inserted_at")} AS inserted_at\``. `column` is SQL text,
 * so pass only literals.
 */
export const isoTimestamp = (sql: SqlClient.SqlClient, column: string) =>
  sql.literal(`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

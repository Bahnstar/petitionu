import { Schema, SchemaTransformation } from "effect"

/*
 * Response timestamps are `Date`s, sent as ISO 8601 UTC strings. The server reads them from
 * Postgres as `Date`s (decoding rows against a DTO's type side) and the response schema writes
 * the string; the browser client reads it back as a `Date`.
 */

/**
 * A timestamp, sent with microseconds as the Phoenix app sent it
 * (`2026-01-01T00:00:00.000000Z`). A `Date` holds milliseconds, so the last three digits are
 * always zero.
 */
export const Timestamp = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Date,
    SchemaTransformation.transform({
      decode: (value) => new Date(value),
      encode: (date) => `${date.toISOString().slice(0, 23)}000Z`,
    }),
  ),
)

/** A petition deadline, sent to the second (`2026-01-01T00:00:00Z`). */
export const Deadline = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Date,
    SchemaTransformation.transform({
      decode: (value) => new Date(value),
      encode: (date) => `${date.toISOString().slice(0, 19)}Z`,
    }),
  ),
)

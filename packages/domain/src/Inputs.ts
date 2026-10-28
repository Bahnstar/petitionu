import { Schema, SchemaTransformation } from "effect"

/*
 * The browser client checks a payload by encoding it before the call, and the server checks it
 * again when it decodes. A check that should see what the user typed (like a trimmed length)
 * therefore sits on the encoded side, before any decoding transformation.
 */

/**
 * A record id. Anything not shaped like a UUID fails as `invalid` for the field, before it can
 * reach Postgres.
 */
export const Uuid = Schema.String.check(Schema.isGUID({ message: "is invalid" }))

/** Trimmed length between `min` and `max`, worded like Ash's changeset errors. */
const trimmedLength = (min: number, max: number) =>
  [
    Schema.makeFilter((value: string) => value.trim().length >= min, {
      message: `length must be greater than or equal to ${min}`,
    }),
    Schema.makeFilter((value: string) => value.trim().length <= max, {
      message: `length must be less than or equal to ${max}`,
    }),
  ] as const

/** A required note: 1 to 5000 characters once trimmed. The handler receives it trimmed. */
export const Note = Schema.String.check(...trimmedLength(1, 5000)).pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.trim()),
)

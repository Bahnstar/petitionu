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

/** Whether `value` is shaped like a record id, for the few ids a handler checks itself. */
export const isUuid = Schema.is(Uuid)

/** At most `maxLength` characters once trimmed, worded like Ash's changeset errors. */
const trimmedMaxLength = (
  maxLength: number,
  message = `length must be less than or equal to ${maxLength}`,
) => Schema.makeFilter((value: string) => value.trim().length <= maxLength, { message })

export interface NoteOptions {
  readonly maxLength: number
  /** The message for a blank or missing value, as the area words it ("is required"). */
  readonly required: string
  /** The message for a value that's too long, when the area doesn't use Ash's default. */
  readonly tooLong?: string
}

/** Required text: present and at most `maxLength` characters once trimmed. Decodes trimmed. */
export const Note = ({ maxLength, required, tooLong }: NoteOptions) => {
  // Encoding reads a missing key's message from the encoded side, decoding from the outer
  // schema, so both carry it.
  const key = { messageMissingKey: required }
  return Schema.String.check(
    Schema.makeFilter((value: string) => value.trim().length > 0, { message: required }),
    trimmedMaxLength(maxLength, tooLong),
  )
    .annotateKey(key)
    .pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()))
    .annotateKey(key)
}

/**
 * Optional text: at most `maxLength` characters once trimmed. Decodes trimmed, with a blank
 * value (or `null`) as `null`.
 */
export const OptionalNote = (maxLength: number) =>
  Schema.NullOr(Schema.String.check(trimmedMaxLength(maxLength))).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.String),
      SchemaTransformation.transform({
        decode: (value) => value?.trim() || null,
        encode: (value) => value,
      }),
    ),
  )

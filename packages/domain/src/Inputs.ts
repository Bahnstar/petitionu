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

/** Postgres text can't hold a NUL byte: the query would fail, as a defect. */
const hasNul = (value: string) => value.includes("\u0000")
const invalidCharacter = "contains an invalid character"

/** Text that reaches Postgres without `Note`'s other checks, such as an email to look up. */
export const PlainText = Schema.String.check(
  Schema.makeFilter((value: string) => !hasNul(value), { message: invalidCharacter }),
)

/** A whole number from `minimum`. One filter, so a value fails with a single message. */
export const WholeNumberFrom = (minimum: number) =>
  Schema.Number.check(
    Schema.makeFilter((value: number) => {
      if (!Number.isSafeInteger(value)) return "is invalid"
      return value >= minimum || `must be more than or equal to ${minimum}`
    }),
  )

/**
 * Text of at most `maxLength` characters once trimmed, worded like Ash's changeset errors, and
 * present when `required` words its absence. One filter, so a value fails with a single message.
 */
const NoteText = (
  maxLength: number,
  tooLong = `length must be less than or equal to ${maxLength}`,
  required?: string,
) =>
  Schema.String.check(
    Schema.makeFilter((value: string) => {
      const length = value.trim().length
      if (required !== undefined && length === 0) return required
      if (length > maxLength) return tooLong
      return !hasNul(value) || invalidCharacter
    }),
  )

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
  return NoteText(maxLength, tooLong, required)
    .annotateKey(key)
    .pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()))
    .annotateKey(key)
}

/**
 * Optional text: at most `maxLength` characters once trimmed. Decodes trimmed, with a blank
 * value (or `null`) as `null`.
 */
export const OptionalNote = (maxLength: number) =>
  Schema.NullOr(NoteText(maxLength)).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.String),
      SchemaTransformation.transform({
        decode: (value) => value?.trim() || null,
        encode: (value) => value,
      }),
    ),
  )

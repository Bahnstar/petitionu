import { type FieldError, type Invalid, invalidField, invalidFields } from "@petitionu/domain"
import { Effect } from "effect"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids are UUIDs; anything else can't name a row, so handlers answer it as not found. */
export const isUuid = (value: string) => uuidPattern.test(value)

/** A checked string input: its value, or the field's error. */
export interface CheckedText {
  readonly value: string | null
  readonly error?: FieldError
}

/**
 * An Ash string attribute's cast: trimmed, blank becomes null, then `required` and `maxLength`
 * are checked. Returns the value or the field's error.
 */
export const text = (
  field: string,
  raw: string | null | undefined,
  options: { readonly maxLength: number; readonly required?: string },
): CheckedText => {
  const value = raw?.trim() || null
  if (value === null && options.required) {
    return { value, error: { field, message: options.required } }
  }
  if (value !== null && value.length > options.maxLength) {
    const message = `length must be less than or equal to ${options.maxLength}`
    return { value, error: { field, message } }
  }
  return { value }
}

/** Fails with every field error in `values`, or returns their values. */
export const checkInput = <K extends string>(values: Record<K, CheckedText>) =>
  Effect.gen(function* () {
    const entries = Object.values(values) as Array<CheckedText>
    const errors = entries.flatMap((entry) => (entry.error ? [entry.error] : []))
    if (errors.length > 0) return yield* invalidFields(errors)
    return Object.fromEntries(
      Object.entries(values).map(([key, entry]) => [key, (entry as CheckedText).value]),
    ) as Record<K, string | null>
  })

/** An optional note: trimmed, blank becoming null, at most 5000 characters. */
export const optionalNote = (field: string, raw: string | null | undefined) => {
  const { value, error } = text(field, raw, { maxLength: 5000 })
  return error ? Effect.fail(invalidField(field, error.message)) : Effect.succeed(value)
}

/** A required note: trimmed, 1 to 5000 characters. */
export const requiredNote = (field: string, raw: string): Effect.Effect<string, Invalid> => {
  const { value, error } = text(field, raw, {
    maxLength: 5000,
    required: "length must be greater than or equal to 1",
  })
  return error ? Effect.fail(invalidField(field, error.message)) : Effect.succeed(value!)
}

import { ApiError } from "@/lib/api"

export interface FormErrors<Field extends string> {
  /** Each field's message, for the fields the form shows. */
  readonly fields: Partial<Record<Field, string>>
  /** What no field on the form can show, or `null` if every error found its field. */
  readonly summary: string | null
}

/** Sorts a failed form's error into messages for its `known` fields and a summary of the rest. */
export function formErrors<Field extends string>(
  error: Error | null,
  known: ReadonlyArray<Field>,
): FormErrors<Field> {
  if (!error) return { fields: {}, summary: null }
  if (!(error instanceof ApiError)) return { fields: {}, summary: error.message }
  const isKnown = (field: string | undefined): field is Field =>
    known.some((name) => name === field)
  const fields: Partial<Record<Field, string>> = {}
  const rest: string[] = []
  for (const { field, message } of error.errors) {
    if (isKnown(field)) fields[field] = fields[field] ? `${fields[field]} ${message}` : message
    else rest.push(message)
  }
  if (rest.length > 0) return { fields, summary: rest.join(" ") }
  return { fields, summary: Object.keys(fields).length > 0 ? null : error.message }
}

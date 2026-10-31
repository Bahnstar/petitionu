import type { RpcErrorEntry } from "@petitionu/domain"

/** A failed RPC call, thrown so queries and forms can act on what the server reported. */
export class ApiError extends Error {
  readonly errors: ReadonlyArray<RpcErrorEntry>

  constructor(errors: ReadonlyArray<RpcErrorEntry>, message: string) {
    super(message)
    this.errors = errors
  }
}

/** An `ApiError` in the server's words, or `fallback` if it sent none. */
export const serverError = (errors: ReadonlyArray<RpcErrorEntry>, fallback = "") =>
  new ApiError(errors, errors.map((error) => error.message).join(" ") || fallback)

/**
 * Retries only what could go differently next time. RPC failures carry no HTTP status: a typed
 * error is the server's answer, while `unknown` means the call itself failed.
 */
export function retryQuery(failureCount: number, error: Error) {
  if (error instanceof ApiError && error.errors.some((entry) => entry.type !== "unknown"))
    return false
  return failureCount < 3
}

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

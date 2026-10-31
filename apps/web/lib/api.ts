import { makeApiClient, type RpcErrorEntry } from "@petitionu/domain"

/** The app's RPC procedures; every call sends the page's CSRF token. */
export const api = makeApiClient()

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

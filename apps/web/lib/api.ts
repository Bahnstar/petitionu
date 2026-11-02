import { makeApiClient, type RpcErrorEntry } from "@petitionu/domain"

let sessionEnded = () => Promise.resolve(false)

/** Sets how to find out whether a call's token was refused because the session is over. */
export function setSessionCheck(check: () => Promise<boolean>) {
  sessionEnded = check
}

/**
 * The app's RPC procedures; every call sends the page's CSRF token. A call refused for that token
 * says to sign in if the session is over. `getMe` is what the session check itself calls, so it
 * reports the refusal as it is.
 */
export const api = makeApiClient({
  onRefused: async (tag) =>
    tag !== "getMe" && (await sessionEnded())
      ? [{ type: "unauthenticated", message: "Sign in to participate." }]
      : undefined,
})

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

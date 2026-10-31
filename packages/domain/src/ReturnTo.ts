/** Where the app lives; sign-in may only return to pages under it. */
const appRoot = "/ash-typescript"

const unsafeSequences = ["\\", "//", "/../", "/./"]

/**
 * `destination` if it is a page of the app that sign-in can safely return to, else
 * `undefined`. Rejects other origins, protocol-relative and backslash tricks, encoded path
 * separators, dot segments, control characters and the auth pages themselves.
 */
export const safeReturnTo = (destination: unknown): string | undefined => {
  if (typeof destination !== "string" || !destination.startsWith("/")) return undefined
  let url: URL
  let path: string
  try {
    url = new URL(destination, "https://return-to.invalid")
    path = decodeURIComponent(destination.split(/[?#]/)[0]!)
  } catch {
    return undefined
  }
  if (url.origin !== "https://return-to.invalid") return undefined
  if (path !== appRoot && !path.startsWith(`${appRoot}/`)) return undefined
  if (unsafeSequences.some((sequence) => path.includes(sequence))) return undefined
  if (path.endsWith("/..") || path.endsWith("/.")) return undefined
  // oxlint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f]/.test(destination + path)) return undefined
  return destination
}

/** The sign-in page that returns to `destination` afterwards. */
export const signInPath = (destination: string) =>
  `/sign-in?${new URLSearchParams({ return_to: destination })}`

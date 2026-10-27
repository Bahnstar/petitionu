import { safeReturnTo } from "@petitionu/domain"
import { useSearchParams } from "react-router-dom"
import { ROUTES } from "@/lib/routes"

const storageKey = "petitionu:return-to"

/** The app page to open after signing in: `?return_to=` when it is safe, else the home page. */
export function useReturnTo(): string {
  const [params] = useSearchParams()
  return safeReturnTo(params.get("return_to")) ?? ROUTES.home
}

/** The `?return_to=` query to carry from one auth page to another, or "". */
export function useReturnToQuery(): string {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get("return_to"))
  return returnTo ? `?${new URLSearchParams({ return_to: returnTo })}` : ""
}

/**
 * Keeps the destination for a page opened later from an email (magic link or confirmation),
 * which carries only a token.
 */
export function rememberReturnTo(destination: string) {
  try {
    localStorage.setItem(storageKey, destination)
  } catch {
    /* Storage can be disabled; the email link then opens the home page. */
  }
}

/** The remembered destination, validated again since storage can be edited, then forgotten. */
export function takeRememberedReturnTo(): string {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(storageKey)
    localStorage.removeItem(storageKey)
  } catch {
    /* Storage can be disabled. */
  }
  return safeReturnTo(stored) ?? ROUTES.home
}

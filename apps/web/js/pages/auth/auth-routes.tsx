import type { ReactElement } from "react"
import ConfirmEmailPage from "./confirm-email-page"
import MagicSignInPage from "./magic-sign-in-page"

/** Auth pages, outside the app layout. The server serves the shell for each of these paths. */
export const authRoutes: ReadonlyArray<{ path: string; element: ReactElement }> = [
  { path: "/auth/confirm", element: <ConfirmEmailPage /> },
  { path: "/auth/magic", element: <MagicSignInPage /> },
]

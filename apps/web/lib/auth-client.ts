import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

/** Better Auth's endpoints under `/api/auth` on this origin. Calls resolve to `{ data, error }`. */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] })

import { appRequestHeaders } from "@petitionu/domain"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowLeftRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type AuthClientError, AuthError, AuthPage, throwLinkError } from "./auth-page"
import { authClient } from "@/lib/auth-client"
import { ROUTES } from "@/lib/routes"

/** Query key prefix: a link's details outlast the sign-in they lead to, which clears the rest. */
export const emailLinkKey = "emailLink"

interface LinkDetails {
  readonly email: string
  /** The other account this browser would leave, if using the link signs in. */
  readonly signedInAs: string | null
}

/**
 * What an emailed link is for, from a lookup that doesn't use it. A page offers its button only
 * once this has answered, so nobody is asked to click for an address they haven't been shown.
 */
export function useEmailLink(
  purpose: "confirm" | "magic",
  token: string | null,
  invalidLink: string,
) {
  return useQuery({
    queryKey: [emailLinkKey, purpose, token],
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await authClient.$fetch<LinkDetails, AuthClientError>(
        "/link-details",
        { method: "POST", headers: appRequestHeaders, body: { purpose, token } },
      )
      throwLinkError(error, invalidLink)
      return data!
    },
  })
}

/** Stops a link from another account replacing this browser's session without a clear choice. */
export function SwitchAccount({
  email,
  signedInAs,
  onSwitch,
}: {
  email: string
  signedInAs: string
  onSwitch: () => void
}) {
  return (
    <AuthPage
      title="You're signed in to another account"
      links={
        <Link to={ROUTES.home} className="auth-link">
          Stay signed in as {signedInAs}
        </Link>
      }
    >
      <AuthError
        message={`You're signed in as ${signedInAs}, but this link is for ${email}. Continuing signs you out of ${signedInAs} and into ${email}. If you didn't ask for this link, stay signed in.`}
      />
      <Button type="button" className="w-full" onClick={onSwitch}>
        <ArrowLeftRight aria-hidden="true" />
        Switch to {email}
      </Button>
    </AuthPage>
  )
}

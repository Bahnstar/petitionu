import { appRequestHeaders } from "@petitionu/domain"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import { AuthError, AuthPage, throwLinkError } from "@/js/features/auth/auth-page"
import { SwitchAccount, useEmailLink } from "@/js/features/auth/email-link"
import { takeRememberedReturnTo } from "@/js/features/auth/return-to"
import { authClient } from "@/lib/auth-client"

const invalidLink = "This sign-in link is invalid or has expired. Request a new one to sign in."

/**
 * Opened from the magic-link email. The link works once, so it is used only on the click. Anyone
 * can send someone a link to their own account, so the page says whose it is first.
 */
export default function MagicSignInPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const navigate = useNavigate()
  const { afterAuthChange } = useAuth()
  const link = useEmailLink("magic", token, invalidLink)
  const [switching, setSwitching] = useState(false)

  const signIn = useMutation({
    mutationFn: async (token: string) => {
      // Better Auth redirects a rejected token to `/?error=`; don't follow it, it isn't JSON.
      const { error } = await authClient.magicLink.verify({
        query: { token },
        fetchOptions: { redirect: "manual", headers: appRequestHeaders },
      })
      throwLinkError(error, invalidLink)
      const returnTo = takeRememberedReturnTo()
      await afterAuthChange({ destination: returnTo })
      return returnTo
    },
    onSuccess: (returnTo) => navigate(returnTo, { replace: true }),
  })

  if (link.data?.signedInAs && !switching) {
    return (
      <SwitchAccount
        email={link.data.email}
        signedInAs={link.data.signedInAs}
        onSwitch={() => setSwitching(true)}
      />
    )
  }

  return (
    <AuthPage
      title="Sign in to PetitionU"
      description={
        link.data ? (
          <>
            Sign in on this device as <strong>{link.data.email}</strong>.
          </>
        ) : (
          "Use the link from your email to sign in on this device."
        )
      }
      links={
        <Link to="/sign-in" className="auth-link">
          Sign in another way
        </Link>
      }
    >
      <AuthError
        message={token ? (link.error?.message ?? signIn.error?.message ?? null) : invalidLink}
      />
      {link.data && (
        <Button
          type="button"
          className="w-full"
          disabled={signIn.isPending || signIn.isSuccess}
          onClick={() => token && signIn.mutate(token)}
        >
          {signIn.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <LogIn aria-hidden="true" />
          )}
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      )}
    </AuthPage>
  )
}

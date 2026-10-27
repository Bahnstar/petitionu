import { useMutation } from "@tanstack/react-query"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import { AuthError, AuthPage, throwLinkError } from "@/js/features/auth/auth-page"
import { takeRememberedReturnTo } from "@/js/features/auth/return-to"
import { authClient } from "@/lib/auth-client"

const invalidLink = "This sign-in link is invalid or has expired. Request a new one to sign in."

/** Opened from the magic-link email. The link works once, so it is used only on the click. */
export default function MagicSignInPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const navigate = useNavigate()
  const { afterAuthChange } = useAuth()

  const signIn = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.magicLink.verify({ query: { token } })
      throwLinkError(error, invalidLink)
      await afterAuthChange()
    },
    onSuccess: () => navigate(takeRememberedReturnTo(), { replace: true }),
  })

  return (
    <AuthPage
      title="Sign in to PetitionU"
      description="Use the link from your email to sign in on this device."
      links={
        <Link to="/sign-in" className="auth-link">
          Sign in another way
        </Link>
      }
    >
      <AuthError message={token ? (signIn.error?.message ?? null) : invalidLink} />
      {token && (
        <Button
          type="button"
          className="w-full"
          disabled={signIn.isPending || signIn.isSuccess}
          onClick={() => signIn.mutate(token)}
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

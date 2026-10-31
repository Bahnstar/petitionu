import { useMutation } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import { authClient } from "@/lib/auth-client"
import { AuthError, AuthNotice, AuthPage, throwLinkError } from "@/js/features/auth/auth-page"
import { takeRememberedReturnTo } from "@/js/features/auth/return-to"

const invalidLink = "This confirmation link is invalid or has expired."

/** Opened from the confirmation email. Mail scanners follow links, so nothing happens until the click. */
export default function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const { afterAuthChange, isAuthenticated, isLoading } = useAuth()

  const confirm = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.verifyEmail({ query: { token } })
      throwLinkError(error, invalidLink)
      await afterAuthChange()
      return takeRememberedReturnTo()
    },
  })

  if (confirm.isSuccess) {
    return (
      <AuthPage title="Email confirmed">
        <AuthNotice>Your email address has now been confirmed.</AuthNotice>
        <Button asChild className="w-full">
          <Link to={confirm.data}>Continue to PetitionU</Link>
        </Button>
      </AuthPage>
    )
  }

  return (
    <AuthPage
      title="Confirm your email"
      description="Confirm that this is your email address to finish setting up your account."
      links={
        <Link to="/sign-in" className="auth-link">
          Back to sign in
        </Link>
      }
    >
      <AuthError message={token ? (confirm.error?.message ?? null) : invalidLink} />
      {token && !isLoading && !isAuthenticated && (
        <AuthNotice>
          Registered with a password? To keep it, sign in on this device and open this link again.
          If you confirm without signing in, the password is removed and you can set a new one by
          resetting it.
        </AuthNotice>
      )}
      {token && (
        <Button
          type="button"
          className="w-full"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate(token)}
        >
          {confirm.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <MailCheck aria-hidden="true" />
          )}
          {confirm.isPending ? "Confirming…" : "Confirm"}
        </Button>
      )}
    </AuthPage>
  )
}

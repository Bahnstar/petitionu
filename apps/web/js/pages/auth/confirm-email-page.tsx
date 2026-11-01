import { useMutation } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import { authClient } from "@/lib/auth-client"
import {
  type AuthClientError,
  AuthError,
  AuthNotice,
  AuthPage,
  throwLinkError,
} from "@/js/features/auth/auth-page"
import { takeRememberedReturnTo, useReturnTo } from "@/js/features/auth/return-to"

const invalidLink = "This confirmation link is invalid or has expired."

/** Where a full page load lands after a removal, so the user still hears about it. */
const passwordRemovedPath = (returnTo: string) =>
  `/auth/confirm?${new URLSearchParams({ password_removed: "1", return_to: returnTo })}`

type Confirmation =
  | { readonly confirmed: false }
  | { readonly confirmed: true; readonly passwordRemoved: boolean; readonly returnTo: string }

function EmailConfirmed({
  passwordRemoved,
  returnTo,
}: {
  passwordRemoved: boolean
  returnTo: string
}) {
  return (
    <AuthPage title="Email confirmed">
      <AuthNotice>Your email address has now been confirmed.</AuthNotice>
      {passwordRemoved && (
        <AuthNotice>
          This account&apos;s password has been removed. To sign in with a password again,{" "}
          <Link to="/reset" className="underline underline-offset-4">
            reset your password
          </Link>
          .
        </AuthNotice>
      )}
      <Button asChild className="w-full">
        <Link to={returnTo}>Continue to PetitionU</Link>
      </Button>
    </AuthPage>
  )
}

/**
 * Opened from the confirmation email. Mail scanners follow links, so nothing happens until the
 * click. Only the server knows whether confirming here would remove the account's password: if
 * so it refuses the first click, and the page warns before sending the second.
 */
export default function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const landedReturnTo = useReturnTo()
  const { afterAuthChange } = useAuth()

  const confirm = useMutation({
    mutationFn: async (input: {
      token: string
      removePassword: boolean
    }): Promise<Confirmation> => {
      const { data, error } = await authClient.$fetch<
        { passwordRemoved?: boolean },
        AuthClientError
      >("/verify-email", {
        query: input.removePassword
          ? { token: input.token, removePassword: "true" }
          : { token: input.token },
      })
      if (error?.code === "CONFIRM_REMOVES_PASSWORD") return { confirmed: false }
      throwLinkError(error, invalidLink)
      const returnTo = takeRememberedReturnTo()
      const passwordRemoved = data?.passwordRemoved === true
      await afterAuthChange({
        destination: passwordRemoved ? passwordRemovedPath(returnTo) : returnTo,
      })
      return { confirmed: true, passwordRemoved, returnTo }
    },
  })

  if (confirm.data?.confirmed) return <EmailConfirmed {...confirm.data} />
  if (params.has("password_removed")) {
    return <EmailConfirmed passwordRemoved returnTo={landedReturnTo} />
  }

  const warned = confirm.data?.confirmed === false
  const confirmLabel = warned ? "Confirm and remove password" : "Confirm"

  return (
    <AuthPage
      title="Confirm your email"
      description="Confirm that this is your email address to finish setting up your account."
      links={
        <Link to="/sign-in" className="auth-link">
          {warned ? "Sign in to keep your password" : "Back to sign in"}
        </Link>
      }
    >
      <AuthError message={token ? (confirm.error?.message ?? null) : invalidLink} />
      {warned && (
        <AuthNotice>
          This account was registered in a different browser, so confirming here removes its
          password. If you registered it, sign in here instead and use the new link we email you. If
          you didn&apos;t, confirm below. You can set a password afterwards.
        </AuthNotice>
      )}
      {token && (
        <Button
          type="button"
          className="w-full"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate({ token, removePassword: warned })}
        >
          {confirm.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <MailCheck aria-hidden="true" />
          )}
          {confirm.isPending ? "Confirming…" : confirmLabel}
        </Button>
      )}
    </AuthPage>
  )
}

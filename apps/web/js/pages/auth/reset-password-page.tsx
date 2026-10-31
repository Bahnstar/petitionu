import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { KeyRound, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import {
  AuthError,
  AuthFailure,
  AuthField,
  AuthNotice,
  AuthPage,
  throwAuthError,
  throwLinkError,
} from "@/js/features/auth/auth-page"
import { useReturnTo, useReturnToQuery } from "@/js/features/auth/return-to"
import { authClient } from "@/lib/auth-client"

/** `/reset` asks for a reset link; the emailed link opens `/reset?token=` to set the password. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  return token ? <SetPasswordForm token={token} /> : <RequestResetForm />
}

function SignInLink() {
  const returnToQuery = useReturnToQuery()
  return (
    <Link to={`/sign-in${returnToQuery}`} className="auth-link">
      Back to sign in
    </Link>
  )
}

function RequestResetForm() {
  const [email, setEmail] = useState("")

  const request = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset" })
      throwAuthError(error, "Couldn’t send a reset link. Please try again.")
      return (
        data?.message ?? "If this email exists in our system, check your email for the reset link"
      )
    },
  })

  return (
    <AuthPage
      title="Forgot your password?"
      description="Enter your email address and we’ll send you a link to reset your password."
      links={<SignInLink />}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!request.isPending) request.mutate()
        }}
      >
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthError message={request.error?.message ?? null} />
        {request.isSuccess && <AuthNotice>{request.data}</AuthNotice>}
        <Button type="submit" className="mt-2 w-full" disabled={request.isPending}>
          {request.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Send aria-hidden="true" />
          )}
          {request.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthPage>
  )
}

const invalidLink = "This reset link is invalid or has expired. Request a new link to try again."

function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const returnTo = useReturnTo()
  const { afterAuthChange } = useAuth()

  const reset = useMutation({
    mutationFn: async () => {
      if (password !== passwordConfirmation)
        throw new AuthFailure("Password confirmation does not match")
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
        fetchOptions: { body: { newPasswordConfirmation: passwordConfirmation } },
      })
      if (error?.code === "PASSWORD_TOO_SHORT" || error?.code === "PASSWORD_TOO_LONG")
        throw new AuthFailure("Choose a password between 8 and 128 characters.")
      throwLinkError(error, invalidLink)
      // The server signs the user in with a new session and revokes the others.
      await afterAuthChange()
    },
  })

  if (reset.isSuccess) {
    return (
      <AuthPage title="Password reset">
        <AuthNotice>Your password has successfully been reset.</AuthNotice>
        <Button asChild className="w-full">
          <Link to={returnTo}>Continue to PetitionU</Link>
        </Button>
      </AuthPage>
    )
  }

  const expired = reset.error?.message === invalidLink

  return (
    <AuthPage
      title="Set a new password"
      links={
        <>
          <SignInLink />
          <Link to="/reset" className="auth-link">
            Request a new link
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!reset.isPending) reset.mutate()
        }}
      >
        <AuthField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <AuthField
          id="password-confirmation"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
        />
        <AuthError message={reset.error?.message ?? null} />
        <Button type="submit" className="mt-2 w-full" disabled={reset.isPending || expired}>
          {reset.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound aria-hidden="true" />
          )}
          {reset.isPending ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </AuthPage>
  )
}

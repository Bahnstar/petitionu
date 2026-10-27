import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import {
  AuthError,
  AuthFailure,
  AuthField,
  AuthNotice,
  AuthPage,
  throwAuthError,
} from "@/js/features/auth/auth-page"
import { rememberReturnTo, useReturnTo, useReturnToQuery } from "@/js/features/auth/return-to"
import { authClient } from "@/lib/auth-client"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const returnTo = useReturnTo()
  const returnToQuery = useReturnToQuery()
  const { afterAuthChange } = useAuth()

  const register = useMutation({
    mutationFn: async () => {
      if (password !== passwordConfirmation)
        throw new AuthFailure("Password confirmation does not match")
      // The confirmation email opens a page that has no `return_to` of its own.
      rememberReturnTo(returnTo)
      const { error } = await authClient.signUp.email({
        email,
        password,
        name: "",
        fetchOptions: { body: { passwordConfirmation } },
      })
      throwAuthError(error, "Couldn’t create your account. Please try again.")
      await afterAuthChange()
      return email
    },
  })

  if (register.isSuccess) {
    return (
      <AuthPage title="Check your email">
        <AuthNotice>
          Your account is ready. We sent a confirmation link to {register.data}; open it to confirm
          your email address.
        </AuthNotice>
        <Button asChild className="w-full">
          <Link to={returnTo}>Continue to PetitionU</Link>
        </Button>
      </AuthPage>
    )
  }

  return (
    <AuthPage
      title="Create an account"
      description="Use your school email address to join your campus."
      links={
        <Link to={`/sign-in${returnToQuery}`} className="auth-link">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!register.isPending) register.mutate()
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
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          aria-describedby="password-hint"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p id="password-hint" className="-mt-3 mb-4 text-xs text-[#567269]">
          At least 8 characters.
        </p>
        <AuthField
          id="password-confirmation"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
        />
        <AuthError message={register.error?.message ?? null} />
        <Button type="submit" className="mt-2 w-full" disabled={register.isPending}>
          {register.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus aria-hidden="true" />
          )}
          {register.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthPage>
  )
}

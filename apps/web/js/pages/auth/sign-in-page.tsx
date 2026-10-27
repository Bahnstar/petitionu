import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { Loader2, LogIn, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/js/contexts/auth-context"
import {
  AuthError,
  AuthField,
  AuthNotice,
  AuthPage,
  throwAuthError,
} from "@/js/features/auth/auth-page"
import { rememberReturnTo, useReturnTo, useReturnToQuery } from "@/js/features/auth/return-to"
import { authClient } from "@/lib/auth-client"

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [missingEmail, setMissingEmail] = useState(false)
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const returnToQuery = useReturnToQuery()
  const { afterAuthChange } = useAuth()

  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.email({ email, password, rememberMe })
      throwAuthError(error, "Incorrect email or password")
      await afterAuthChange()
    },
    onSuccess: () => navigate(returnTo, { replace: true }),
  })

  const magicLink = useMutation({
    mutationFn: async () => {
      rememberReturnTo(returnTo)
      const { error } = await authClient.signIn.magicLink({ email })
      throwAuthError(error, "Couldn’t send a sign-in link. Please try again.")
      return email
    },
  })

  const sendMagicLink = () => {
    const field = document.getElementById("email")
    if (!email.trim() || (field instanceof HTMLInputElement && !field.validity.valid)) {
      setMissingEmail(true)
      field?.focus()
      return
    }
    setMissingEmail(false)
    signIn.reset()
    magicLink.mutate()
  }

  const error =
    (missingEmail ? "Enter your email address to get a sign-in link." : null) ??
    signIn.error?.message ??
    magicLink.error?.message ??
    null

  return (
    <AuthPage
      title="Sign in"
      links={
        <>
          <Link to={`/reset${returnToQuery}`} className="auth-link">
            Forgot your password?
          </Link>
          <Link to={`/register${returnToQuery}`} className="auth-link">
            Create an account
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (signIn.isPending) return
          setMissingEmail(false)
          magicLink.reset()
          signIn.mutate()
        }}
      >
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={missingEmail || undefined}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="my-4 flex items-center gap-2 text-sm text-[#567269]">
          <input
            type="checkbox"
            className="size-4 accent-[#204c48]"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Remember me
        </label>
        <AuthError message={error} />
        {magicLink.isSuccess && (
          <AuthNotice>
            Check your email. We sent a sign-in link to {magicLink.data}; it works once, within 10
            minutes.
          </AuthNotice>
        )}
        <Button type="submit" className="w-full" disabled={signIn.isPending}>
          {signIn.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <LogIn aria-hidden="true" />
          )}
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="relative my-6 flex items-center" role="separator">
        <span className="flex-1 border-t border-[#d7e5df]" aria-hidden="true" />
        <span className="px-3 text-sm text-[#567269]">or</span>
        <span className="flex-1 border-t border-[#d7e5df]" aria-hidden="true" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={magicLink.isPending}
        onClick={sendMagicLink}
      >
        {magicLink.isPending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Mail aria-hidden="true" />
        )}
        {magicLink.isPending ? "Sending link…" : "Send me a magic link"}
      </Button>
    </AuthPage>
  )
}

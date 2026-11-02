import { appRequestHeaders } from "@petitionu/domain"
import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { KeyRound, Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { useAuth } from "@/js/contexts/auth-context"
import { authClient } from "@/lib/auth-client"
import {
  type AuthClientError,
  AuthError,
  AuthField,
  AuthNotice,
  AuthPage,
  throwLinkError,
} from "@/js/features/auth/auth-page"
import { SwitchAccount, useEmailLink } from "@/js/features/auth/email-link"
import { takeRememberedReturnTo, useReturnTo } from "@/js/features/auth/return-to"

const invalidLink = "This confirmation link is invalid or has expired."

const passwordRemovedKey = "petitionu:password-removed"

/**
 * Carries the password-removed notice over a full page load. Session storage belongs to this tab
 * on this origin, so unlike a query string a crafted link can't set it. Returns whether it stuck.
 */
function rememberPasswordRemoved() {
  try {
    sessionStorage.setItem(passwordRemovedKey, "1")
    return true
  } catch {
    return false /* Storage can be disabled; the notice is then lost with the page. */
  }
}

function passwordWasRemoved() {
  try {
    return sessionStorage.getItem(passwordRemovedKey) !== null
  } catch {
    return false
  }
}

function forgetPasswordRemoved() {
  try {
    sessionStorage.removeItem(passwordRemovedKey)
  } catch {
    /* Storage can be disabled. */
  }
}

/** Where a full page load lands after a removal, so the user still hears about it. */
const passwordRemovedPath = (returnTo: string) =>
  `/auth/confirm?${new URLSearchParams({ return_to: returnTo })}`

interface ConfirmResponse {
  readonly passwordRemoved?: boolean
}

type Confirmation =
  | { readonly confirmed: false; readonly wrongPassword: boolean }
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
 * Opened from the confirmation email. Mail scanners follow links, so nothing is used until the
 * click. Sign-up doesn't prove the address, so an account's password may be someone else's: only
 * entering it keeps it, and continuing without it removes it. The server decides: if a plain click
 * would remove a password the page didn't know about, it refuses, and the page asks.
 */
export default function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const landedReturnTo = useReturnTo()
  const { afterAuthChange } = useAuth()
  const link = useEmailLink("confirm", token, invalidLink)
  const [switching, setSwitching] = useState(false)
  const [refused, setRefused] = useState(false)
  const [password, setPassword] = useState("")
  const [removedBeforeLoad] = useState(passwordWasRemoved)
  useEffect(forgetPasswordRemoved, [])

  const confirm = useMutation({
    mutationFn: async (input: {
      token: string
      password?: string
      removePassword?: boolean
    }): Promise<Confirmation> => {
      const { data, error } = await (input.password === undefined
        ? authClient.$fetch<ConfirmResponse, AuthClientError>("/verify-email", {
            headers: appRequestHeaders,
            query: input.removePassword
              ? { token: input.token, removePassword: "true" }
              : { token: input.token },
          })
        : authClient.$fetch<ConfirmResponse, AuthClientError>("/verify-email/password", {
            method: "POST",
            headers: appRequestHeaders,
            body: { token: input.token, password: input.password },
          }))
      if (error?.code === "CONFIRM_REMOVES_PASSWORD") {
        setRefused(true)
        return { confirmed: false, wrongPassword: false }
      }
      if (error?.code === "INVALID_PASSWORD") return { confirmed: false, wrongPassword: true }
      throwLinkError(error, invalidLink)
      const returnTo = takeRememberedReturnTo()
      const passwordRemoved = data?.passwordRemoved === true
      const notice = passwordRemoved && rememberPasswordRemoved()
      await afterAuthChange({ destination: notice ? passwordRemovedPath(returnTo) : returnTo })
      // Still here, so there was no full page load and this page says it itself.
      forgetPasswordRemoved()
      return { confirmed: true, passwordRemoved, returnTo }
    },
  })

  if (confirm.data?.confirmed) return <EmailConfirmed {...confirm.data} />
  if (removedBeforeLoad && !token) {
    return <EmailConfirmed passwordRemoved returnTo={landedReturnTo} />
  }

  if (link.data?.signedInAs && !switching) {
    return (
      <SwitchAccount
        email={link.data.email}
        signedInAs={link.data.signedInAs}
        onSwitch={() => setSwitching(true)}
      />
    )
  }

  const asksPassword = link.data?.needsPassword || refused
  const wrongPassword = confirm.data?.wrongPassword ? "Incorrect password" : undefined

  return (
    <AuthPage
      title="Confirm your email"
      description={
        link.data ? (
          <>
            Confirm that <strong>{link.data.email}</strong> is your email address to finish setting
            up your account.
          </>
        ) : (
          "Confirm that this is your email address to finish setting up your account."
        )
      }
      links={
        <Link to="/sign-in" className="auth-link">
          Back to sign in
        </Link>
      }
    >
      <AuthError
        message={token ? (link.error?.message ?? confirm.error?.message ?? null) : invalidLink}
      />
      {link.data && token && !asksPassword && (
        <Button
          type="button"
          className="w-full"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate({ token })}
        >
          {confirm.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <MailCheck aria-hidden="true" />
          )}
          {confirm.isPending ? "Confirming…" : "Confirm"}
        </Button>
      )}
      {link.data && token && asksPassword && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!confirm.isPending) confirm.mutate({ token, password })
          }}
        >
          <AuthNotice>
            This account has a password. Enter it to keep it. If you didn&apos;t set one or
            can&apos;t remember it, continue without it: the password is removed, and you can set a
            new one with a password reset.
          </AuthNotice>
          <AuthField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...fieldErrorProps("password-error", wrongPassword)}
          />
          <FieldError id="password-error" message={wrongPassword} />
          <div className="mt-4 grid gap-2">
            <Button type="submit" className="w-full" disabled={confirm.isPending}>
              {confirm.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound aria-hidden="true" />
              )}
              {confirm.isPending ? "Confirming…" : "Keep my password"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate({ token, removePassword: true })}
            >
              Continue without password
            </Button>
          </div>
        </form>
      )}
    </AuthPage>
  )
}

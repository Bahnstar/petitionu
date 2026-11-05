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

interface ConfirmInput {
  readonly token: string
  readonly password?: string
  readonly removePassword?: boolean
}

/** `/verify-email` is a GET and can't carry a password, which has its own endpoint. */
const sendConfirmation = ({ token, password, removePassword }: ConfirmInput) =>
  password === undefined
    ? authClient.$fetch<ConfirmResponse, AuthClientError>("/verify-email", {
        headers: appRequestHeaders,
        query: removePassword ? { token, removePassword: "true" } : { token },
      })
    : authClient.$fetch<ConfirmResponse, AuthClientError>("/verify-email/password", {
        method: "POST",
        headers: appRequestHeaders,
        body: { token, password },
      })

/** Asks for the account's password, the only way to keep it, or to go on without it. */
function KeepPasswordForm({
  pending,
  wrongPassword,
  onKeep,
  onRemove,
}: {
  pending: boolean
  wrongPassword: string | undefined
  onKeep: (password: string) => void
  onRemove: () => void
}) {
  const [password, setPassword] = useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!pending) onKeep(password)
      }}
    >
      <AuthNotice>
        This account has a password. Enter it to keep it. If you didn&apos;t set one or can&apos;t
        remember it, continue without it: the password is removed, and you can set a new one with a
        password reset.
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound aria-hidden="true" />
          )}
          {pending ? "Confirming…" : "Keep my password"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={onRemove}
        >
          Continue without password
        </Button>
      </div>
    </form>
  )
}

/** One click, for an account with no password to prove. */
function ConfirmButton({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  return (
    <Button type="button" className="w-full" disabled={pending} onClick={onConfirm}>
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <MailCheck aria-hidden="true" />
      )}
      {pending ? "Confirming…" : "Confirm"}
    </Button>
  )
}

function ConfirmDescription({ email }: { email: string | undefined }) {
  if (!email) return "Confirm that this is your email address to finish setting up your account."
  return (
    <>
      Confirm that <strong>{email}</strong> is your email address to finish setting up your account.
    </>
  )
}

/** Sends a confirmation; a page that gets `confirmed: false` asks for the password. */
function useConfirmation() {
  const { afterAuthChange } = useAuth()
  const [refused, setRefused] = useState(false)
  const confirm = useMutation({
    mutationFn: async (input: ConfirmInput): Promise<Confirmation> => {
      const { data, error } = await sendConfirmation(input)
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
  return { confirm, refused }
}

function ConfirmForm({
  token,
  link,
  confirm,
  refused,
}: ReturnType<typeof useConfirmation> & {
  token: string | null
  link: ReturnType<typeof useEmailLink>
}) {
  const ready = link.data && token
  const asksPassword = link.data?.needsPassword || refused
  const error = link.error?.message ?? confirm.error?.message ?? null
  const wrongPassword = confirm.data?.confirmed === false && confirm.data.wrongPassword

  return (
    <AuthPage
      title="Confirm your email"
      description={<ConfirmDescription email={link.data?.email} />}
      links={
        <Link to="/sign-in" className="auth-link">
          Back to sign in
        </Link>
      }
    >
      <AuthError message={token ? error : invalidLink} />
      {ready && !asksPassword && (
        <ConfirmButton pending={confirm.isPending} onConfirm={() => confirm.mutate({ token })} />
      )}
      {ready && asksPassword && (
        <KeepPasswordForm
          pending={confirm.isPending}
          wrongPassword={wrongPassword ? "Incorrect password" : undefined}
          onKeep={(password) => confirm.mutate({ token, password })}
          onRemove={() => confirm.mutate({ token, removePassword: true })}
        />
      )}
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
  const link = useEmailLink("confirm", token, invalidLink)
  const confirmation = useConfirmation()
  const [switching, setSwitching] = useState(false)
  const [removedBeforeLoad] = useState(passwordWasRemoved)
  useEffect(forgetPasswordRemoved, [])

  const confirmed = confirmation.confirm.data
  if (confirmed?.confirmed) return <EmailConfirmed {...confirmed} />
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

  return <ConfirmForm token={token} link={link} {...confirmation} />
}

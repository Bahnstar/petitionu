import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { KeyRound, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { useAuth, type CurrentUser } from "../../contexts/auth-context"
import { AuthFailure, throwAuthError } from "../auth/auth-page"

const minLength = 8

/**
 * The profile's password card. Accounts with a password change it here; magic-link-only
 * accounts have no current password to give, so they're sent a reset link, which sets one.
 */
export function PasswordSettings({ user }: { user: CurrentUser }) {
  return (
    <Card className="mt-6 gap-0 rounded-2xl p-5 shadow-none sm:p-7">
      <h2 className="text-lg font-semibold">Password</h2>
      {user.hasPassword ? <ChangePasswordForm /> : <SetPasswordLink email={user.email} />}
    </Card>
  )
}

function ChangePasswordForm() {
  const { afterAuthChange } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")

  const change = useMutation({
    mutationFn: async () => {
      if (newPassword.length < minLength)
        throw new AuthFailure(`Choose a new password of at least ${minLength} characters.`)
      if (newPassword !== confirmation) throw new AuthFailure("The new passwords don’t match.")
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        fetchOptions: { body: { newPasswordConfirmation: confirmation } },
      })
      if (error?.code === "INVALID_PASSWORD")
        throw new AuthFailure("Your current password is incorrect.")
      if (error?.code === "PASSWORD_TOO_LONG")
        throw new AuthFailure("Choose a new password of at most 128 characters.")
      throwAuthError(error, "Your password couldn’t be changed. Please try again.")
      // Every other session is signed out; this one's CSRF token and queries are reloaded.
      await afterAuthChange({ sameUser: true })
    },
    onSuccess: () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmation("")
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!change.isPending) change.mutate()
  }

  const fields = [
    ["current-password", "Current password", currentPassword, setCurrentPassword],
    ["new-password", "New password", newPassword, setNewPassword],
    ["confirm-new-password", "Confirm new password", confirmation, setConfirmation],
  ] as const

  return (
    <>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Changing your password signs you out on every other device.
      </p>
      <form id="change-password-form" onSubmit={submit} className="space-y-5">
        {fields.map(([id, label, value, setValue]) => (
          <div key={id} className="space-y-2">
            <Label htmlFor={`profile-${id}`}>{label}</Label>
            <Input
              id={`profile-${id}`}
              name={id}
              type="password"
              autoComplete={id === "current-password" ? "current-password" : "new-password"}
              required
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                if (!change.isPending) change.reset()
              }}
              disabled={change.isPending}
            />
            {id === "new-password" && (
              <p className="text-xs text-muted-foreground">At least {minLength} characters.</p>
            )}
          </div>
        ))}
        {change.isError && (
          <p role="alert" className="text-sm text-destructive">
            {change.error.message}
          </p>
        )}
        {change.isSuccess && (
          <p role="status" className="text-sm">
            Your password is changed. Other devices have been signed out.
          </p>
        )}
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="mr-2 size-4" aria-hidden="true" />
          )}
          {change.isPending ? "Changing..." : "Change password"}
        </Button>
      </form>
    </>
  )
}

function SetPasswordLink({ email }: { email: string }) {
  const request = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset" })
      throwAuthError(error, "Couldn’t send the link. Please try again.")
    },
  })

  return (
    <>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        You sign in with emailed links, so your account has no password yet. We can email {email} a
        link to set one.
      </p>
      {request.isError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {request.error.message}
        </p>
      )}
      {request.isSuccess ? (
        <p role="status" className="text-sm">
          Check your email: we sent {email} a link to set your password.
        </p>
      ) : (
        <Button
          type="button"
          className="self-start"
          onClick={() => request.mutate()}
          disabled={request.isPending}
        >
          {request.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="mr-2 size-4" aria-hidden="true" />
          )}
          {request.isPending ? "Sending..." : "Email me a link to set a password"}
        </Button>
      )}
    </>
  )
}

import { useRef, useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { formErrors, serverError } from "@/lib/api-errors"
import { useAuth, type CurrentUser } from "../contexts/auth-context"
import { AuthLink } from "../components/auth-link"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useFocusFirstInvalid } from "../hooks/use-focus-first-invalid"
import { ProfileConnection } from "../features/profile/profile-connection"
import { PasswordSettings } from "../features/profile/password-settings"

export default function ProfilePage() {
  useDocumentTitle("Your profile")
  const { user, isLoading, error, refetch } = useAuth()

  if (isLoading) {
    return (
      <main className="app-page" aria-busy="true">
        <p role="status">Loading your profile...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-page">
        <p role="alert">We could not load your profile.</p>
        <Button onClick={refetch}>Try again</Button>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app-page">
        <h1 className="app-page-heading">Your profile</h1>
        <p className="app-page-description">
          Sign in to choose how your name appears and connect with your campus.
        </p>
        <Button asChild className="mt-6">
          <AuthLink>Sign in</AuthLink>
        </Button>
      </main>
    )
  }

  return <ProfileForm key={user.id} user={user} />
}

function ProfileForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState(user.firstName ?? "")
  const [lastName, setLastName] = useState(user.lastName ?? "")
  const [graduationYear, setGraduationYear] = useState(user.graduationYear?.toString() ?? "")

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        graduationYear: graduationYear ? Number(graduationYear) : null,
      })
      if (result.success === false) {
        throw serverError(result.errors, "Your profile could not be saved. Try again.")
      }
      return result.data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["currentUser"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboardUser", user.id] }),
      ])
    },
  })

  const form = useRef<HTMLFormElement>(null)
  useFocusFirstInvalid(form, save.error)
  const errors = formErrors(save.error, ["firstName", "lastName", "graduationYear"])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <main className="app-page !max-w-2xl">
      <h1 className="app-page-heading">Your profile</h1>
      <p className="app-page-description mt-3">
        Complete your profile to create petitions, sign, and join your campus community.
      </p>
      <ProfileConnection user={user} />
      <Card className="mt-6 gap-0 rounded-2xl p-5 shadow-none sm:p-7">
        <h2 className="text-lg font-semibold">Profile details</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          The name your campus community will see.
        </p>
        <form id="profile-form" ref={form} onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="profile-first-name">First name</Label>
            <Input
              id="profile-first-name"
              name="given-name"
              autoComplete="given-name"
              required
              maxLength={100}
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value)
                save.reset()
              }}
              disabled={save.isPending}
              {...fieldErrorProps("profile-first-name-error", errors.fields.firstName)}
            />
            <FieldError id="profile-first-name-error" message={errors.fields.firstName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input
              id="profile-last-name"
              name="family-name"
              autoComplete="family-name"
              required
              maxLength={100}
              value={lastName}
              onChange={(event) => {
                setLastName(event.target.value)
                save.reset()
              }}
              disabled={save.isPending}
              {...fieldErrorProps("profile-last-name-error", errors.fields.lastName)}
            />
            <FieldError id="profile-last-name-error" message={errors.fields.lastName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-graduation-year">
              Graduation year <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="profile-graduation-year"
              name="graduation-year"
              type="number"
              inputMode="numeric"
              min={1900}
              max={2100}
              step={1}
              value={graduationYear}
              onChange={(event) => {
                setGraduationYear(event.target.value)
                save.reset()
              }}
              disabled={save.isPending}
              {...fieldErrorProps("profile-graduation-year-error", errors.fields.graduationYear)}
            />
            <FieldError id="profile-graduation-year-error" message={errors.fields.graduationYear} />
          </div>
          {errors.summary && (
            <p role="alert" className="text-sm text-destructive">
              {errors.summary}
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="text-sm">
              Your profile is saved. You can now participate on campus.
            </p>
          )}
          <Button type="submit" disabled={save.isPending || !user.emailVerified}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
            {save.isPending ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </Card>
      <PasswordSettings user={user} />
    </main>
  )
}

import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { buildCSRFHeaders, updateMyProfile } from "../ash_rpc"
import { useAuth, type CurrentUser } from "../contexts/auth-context"
import { AuthLink } from "../components/auth-link"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function ProfilePage() {
  useDocumentTitle("Your profile")
  const { user, isLoading, error, refetch } = useAuth()

  if (isLoading) {
    return <main className="app-page" aria-busy="true"><p role="status">Loading your profile...</p></main>
  }

  if (error) {
    return <main className="app-page"><p role="alert">We could not load your profile.</p><Button onClick={refetch}>Try again</Button></main>
  }

  if (!user) {
    return <main className="app-page"><h1 className="app-page-heading">Your profile</h1><p className="app-page-description">Sign in to choose how your name appears and connect with your campus.</p><Button asChild className="mt-6"><AuthLink>Sign in</AuthLink></Button></main>
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
      const result = await updateMyProfile({
        input: { firstName: firstName.trim(), lastName: lastName.trim(), graduationYear: graduationYear ? Number(graduationYear) : null },
        fields: ["id", "profileComplete", { organization: ["name"] }],
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors.map((error) => error.message).join(" ") || "Your profile could not be saved. Try again.")
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <main className="app-page !max-w-2xl">
      <h1 className="app-page-heading">Your profile</h1>
      <p className="app-page-description mt-3">Complete your profile to create petitions, sign, and join your campus community.</p>
      <Card className="mt-8 gap-0 rounded-2xl p-6 shadow-none">
        <div className="mb-6 space-y-2 border-b border-border pb-6">
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-sm text-muted-foreground">{user.emailVerified ? "Email confirmed" : "Check your inbox and confirm your email before saving your profile."}</p>
          <p className="text-sm text-muted-foreground">{user.organization?.name ? `Campus: ${user.organization.name}` : "Your campus will be matched using your confirmed email address."}</p>
          {!user.emailVerified && <Button type="button" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["currentUser"] })}>I confirmed my email</Button>}
          <p className="text-sm"><Link className="underline underline-offset-4" to="/ash-typescript/support">Need help with your email or campus?</Link></p>
        </div>
        <form id="profile-form" onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="profile-first-name">First name</Label>
            <Input id="profile-first-name" name="given-name" autoComplete="given-name" required maxLength={100} value={firstName} onChange={(event) => { setFirstName(event.target.value); save.reset() }} disabled={save.isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input id="profile-last-name" name="family-name" autoComplete="family-name" required maxLength={100} value={lastName} onChange={(event) => { setLastName(event.target.value); save.reset() }} disabled={save.isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-graduation-year">Graduation year <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="profile-graduation-year" name="graduation-year" type="number" inputMode="numeric" min={1900} max={2100} step={1} value={graduationYear} onChange={(event) => { setGraduationYear(event.target.value); save.reset() }} disabled={save.isPending} />
          </div>
          {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
          {save.isSuccess && <p role="status" className="text-sm">Your profile is saved. You can now participate on campus.</p>}
          <Button type="submit" disabled={save.isPending || !user.emailVerified}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
            {save.isPending ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </Card>
    </main>
  )
}

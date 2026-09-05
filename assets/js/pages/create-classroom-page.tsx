import { AuthLink } from "../components/auth-link"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { createClassroom, buildCSRFHeaders } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useAuth } from "../contexts/auth-context"

export default function CreateClassroomPage() {
  useDocumentTitle("New Classroom")

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user: currentUser, isLoading: authLoading } = useAuth()

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    allowStudentPetitions: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createClassroom({
        input: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          allowStudentPetitions: formData.allowStudentPetitions,
        },
        fields: ["id", "name", "joinCode"],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to create classroom")
      }

      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      navigate(ROUTES.classroom(data.id))
    },
    onError: (err: Error) => {
      setErrors({ general: err.message })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.emailVerified || !currentUser.profileComplete || createMutation.isPending) return
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Classroom name is required"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    createMutation.mutate()
  }

  if (authLoading) {
    return (
      <main className="app-page" aria-busy="true">
        <p role="status" className="app-page-description">Getting your classroom ready…</p>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="app-page">
        <section id="create-classroom-sign-in" className="app-empty-state">
          <h1 className="app-page-heading">Make room for your class.</h1>
          <p className="app-page-description">Sign in to create a classroom and invite your students to share their ideas.</p>
          <Button asChild className="mt-6"><AuthLink>Sign in</AuthLink></Button>
        </section>
      </main>
    )
  }

  if (!currentUser.emailVerified || !currentUser.profileComplete) {
    return <main className="app-page"><section className="app-empty-state"><h1 className="app-page-heading">Get ready to create your classroom.</h1><p className="app-page-description">Confirm your email and complete your campus profile before creating a classroom.</p><Button asChild className="mt-6"><Link to="/ash-typescript/profile">Complete your profile</Link></Button></section></main>
  }

  if (currentUser.role !== "professor" && currentUser.role !== "admin") {
    return (
      <main className="app-page">
        <section id="create-classroom-role-required" className="app-empty-state">
          <h1 className="app-page-heading">Join your classroom.</h1>
          <p className="app-page-description">Professors and administrators can create classrooms. Ask your professor for a join code to get started.</p>
          <Button asChild className="mt-6"><Link to={ROUTES.classrooms}>Find your class</Link></Button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page !max-w-3xl">
        {/* Back Link */}
        <Link
          to={ROUTES.classrooms}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to classrooms
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="app-page-heading mb-3">
            Create classroom
          </h1>
          <p className="app-page-description">
            Give your students a place to turn shared ideas into change.
          </p>
        </div>

        {/* Form */}
        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <form id="create-classroom-form" onSubmit={handleSubmit} className="space-y-7">
            {errors.general && (
              <div role="alert" className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{errors.general}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Classroom name <span className="text-muted-foreground">(required)</span></Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Introduction to Political Science"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "classroom-name-error" : undefined}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  setErrors((current) => ({ ...current, name: "" }))
                }}
                disabled={createMutation.isPending}
              />
              {errors.name && <p id="classroom-name-error" role="alert" className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="description"
                placeholder="What will your class explore together?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Students will see this when they join your classroom.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
              <input
                type="checkbox"
                id="allowStudentPetitions"
                checked={formData.allowStudentPetitions}
                onChange={(e) =>
                  setFormData({ ...formData, allowStudentPetitions: e.target.checked })
                }
                disabled={createMutation.isPending}
                className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
              />
              <div>
                <Label htmlFor="allowStudentPetitions" className="cursor-pointer">
                  Allow students to create petitions
                </Label>
                <p className="text-xs text-muted-foreground">
                  If disabled, only you (the professor) can create petitions in this classroom.
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">We’ll give you a join code to share with your students after you create the classroom.</p>
            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
              <Button type="button" variant="outline" onClick={() => navigate(ROUTES.classrooms)} disabled={createMutation.isPending}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create classroom"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  )
}

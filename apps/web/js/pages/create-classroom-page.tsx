import { AuthLink } from "../components/auth-link"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { api } from "@/lib/api"
import { formErrors, serverError } from "@/lib/api-errors"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useFocusFirstInvalid } from "../hooks/use-focus-first-invalid"
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
  const [errors, setErrors] = useState<Partial<Record<"name" | "description" | "general", string>>>(
    {},
  )
  const form = useRef<HTMLFormElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors.general) errorSummary.current?.focus()
  }, [errors.general])

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await api.createClassroom({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        allowStudentPetitions: formData.allowStudentPetitions,
      })

      if (result.success === false) {
        throw serverError(result.errors, "Failed to create classroom")
      }

      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      navigate(ROUTES.classroom(data.id))
    },
    onError: (err: Error) => {
      const { fields, summary } = formErrors(err, ["name", "description"])
      setErrors({ ...fields, general: summary ?? "" })
    },
  })
  useFocusFirstInvalid(form, createMutation.error)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.emailVerified || !currentUser.profileComplete || createMutation.isPending)
      return
    if (!formData.name.trim()) {
      setErrors({ name: "Classroom name is required" })
      nameInput.current?.focus()
      return
    }

    setErrors({})
    createMutation.mutate()
  }

  if (authLoading) {
    return (
      <main className="app-page" aria-busy="true">
        <p role="status" className="app-page-description">
          Getting your classroom ready…
        </p>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="app-page">
        <section id="create-classroom-sign-in" className="app-empty-state">
          <h1 className="app-page-heading">Make room for your class.</h1>
          <p className="app-page-description">
            Sign in to create a classroom and invite your students to share their ideas.
          </p>
          <Button asChild className="mt-6">
            <AuthLink>Sign in</AuthLink>
          </Button>
        </section>
      </main>
    )
  }

  if (!currentUser.emailVerified || !currentUser.profileComplete) {
    return (
      <main className="app-page">
        <section className="app-empty-state">
          <h1 className="app-page-heading">Get ready to create your classroom.</h1>
          <p className="app-page-description">
            Confirm your email and complete your campus profile before creating a classroom.
          </p>
          <Button asChild className="mt-6">
            <Link to="/ash-typescript/profile">Complete your profile</Link>
          </Button>
        </section>
      </main>
    )
  }

  if (currentUser.role !== "professor" && currentUser.role !== "admin") {
    return (
      <main className="app-page">
        <section id="create-classroom-role-required" className="app-empty-state">
          <h1 className="app-page-heading">Join your classroom.</h1>
          <p className="app-page-description">
            Professors and administrators can create classrooms. Ask your professor for a join code
            to get started.
          </p>
          <Button asChild className="mt-6">
            <Link to={ROUTES.classrooms}>Find your class</Link>
          </Button>
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
          className="mb-6 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to classrooms
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="app-page-heading mb-3">Create classroom</h1>
          <p className="app-page-description">
            Give your students a place to turn shared ideas into change.
          </p>
        </div>

        {/* Form */}
        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <form id="create-classroom-form" ref={form} onSubmit={handleSubmit} className="space-y-7">
            {errors.general && (
              <div
                ref={errorSummary}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 p-4"
              >
                <p className="text-sm text-destructive">{errors.general}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">
                Classroom name <span className="text-muted-foreground">(required)</span>
              </Label>
              <Input
                id="name"
                ref={nameInput}
                aria-required="true"
                type="text"
                placeholder="e.g., Introduction to Political Science"
                {...fieldErrorProps("classroom-name-error", errors.name)}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  setErrors((current) => ({ ...current, name: "" }))
                }}
                disabled={createMutation.isPending}
              />
              <FieldError id="classroom-name-error" message={errors.name} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="What will your class explore together?"
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value })
                  setErrors((current) => ({ ...current, description: "" }))
                }}
                rows={4}
                disabled={createMutation.isPending}
                {...fieldErrorProps("classroom-description-error", errors.description)}
              />
              <FieldError id="classroom-description-error" message={errors.description} />
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

            <p className="text-sm text-muted-foreground">
              We’ll give you a join code to share with your students after you create the classroom.
            </p>
            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(ROUTES.classrooms)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

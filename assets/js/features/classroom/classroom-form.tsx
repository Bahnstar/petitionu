import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { createClassroom, updateClassroom, buildCSRFHeaders, type AshRpcError } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"

class ClassroomFormError extends Error {
  constructor(public errors: AshRpcError[]) {
    super("Please check the classroom details.")
  }
}
interface ClassroomSettings {
  id: string
  name: string
  description?: string | null
  allowStudentPetitions: boolean
}
export function ClassroomForm({ classroom }: { classroom?: ClassroomSettings }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: classroom?.name ?? "",
    description: classroom?.description ?? "",
    allowStudentPetitions: classroom?.allowStudentPetitions ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const nameInput = useRef<HTMLInputElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors.name) nameInput.current?.focus()
  }, [errors.name])

  useEffect(() => {
    if (errors.general) errorSummary.current?.focus()
  }, [errors.general])

  const createMutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        allowStudentPetitions: formData.allowStudentPetitions,
      }
      const fields = ["id", "name", "joinCode"] as const
      const result = classroom
        ? await updateClassroom({
            identity: classroom.id,
            input,
            fields: [...fields],
            headers: buildCSRFHeaders(),
          })
        : await createClassroom({ input, fields: [...fields], headers: buildCSRFHeaders() })

      if (result.success === false) {
        throw new ClassroomFormError(result.errors)
      }

      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      queryClient.invalidateQueries({ queryKey: ["classroom", data.id] })
      queryClient.invalidateQueries({ queryKey: ["classroomSettings", data.id] })
      navigate(ROUTES.classroom(data.id), {
        state: {
          classroomNotice: classroom
            ? "Classroom settings saved."
            : `Classroom created. Join code: ${data.joinCode}`,
        },
      })
    },
    onError: (err: Error) => {
      if (err instanceof ClassroomFormError) {
        const mapped: Record<string, string> = {}
        for (const error of err.errors) {
          const field = error.fields.find((field) =>
            ["name", "description", "allowStudentPetitions", "allow_student_petitions"].includes(
              field,
            ),
          )
          const key =
            field === "allow_student_petitions" ? "allowStudentPetitions" : field || "general"
          mapped[key] = error.message
        }
        setErrors(mapped)
      } else setErrors({ general: "Couldn’t save your classroom. Please try again." })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending) return
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Classroom name is required"
    }

    if (formData.name.length > 255) newErrors.name = "Use 255 characters or fewer."
    if (formData.description.length > 2000) newErrors.description = "Use 2,000 characters or fewer."
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      nameInput.current?.focus()
      return
    }

    setErrors({})
    createMutation.mutate()
  }

  const submitLabel = classroom ? "Save settings" : "Create classroom"
  return (
    <Card className="gap-0 rounded-2xl p-6 shadow-none">
      <form id="classroom-form" onSubmit={handleSubmit} className="space-y-7">
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
            aria-invalid={!!errors.name}
            maxLength={255}
            aria-describedby="classroom-name-count classroom-name-error"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value })
              setErrors((current) => ({ ...current, name: "" }))
            }}
            disabled={createMutation.isPending}
          />
          <p id="classroom-name-count" className="text-xs text-muted-foreground">
            {formData.name.length} / 255 characters
          </p>
          {errors.name && (
            <p id="classroom-name-error" role="alert" className="text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">
            Description <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="description"
            maxLength={2000}
            aria-invalid={!!errors.description}
            aria-describedby="classroom-description-count classroom-description-error"
            placeholder="What will your class explore together?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            disabled={createMutation.isPending}
          />
          <p id="classroom-description-count" className="text-xs text-muted-foreground">
            {formData.description.length} / 2,000 characters
          </p>
          {errors.description && (
            <p id="classroom-description-error" role="alert" className="text-sm text-destructive">
              {errors.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Students will see this when they join your classroom.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
          <Switch
            aria-describedby="student-petitions-help student-petitions-error"
            id="allowStudentPetitions"
            checked={formData.allowStudentPetitions}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, allowStudentPetitions: checked })
            }
            disabled={createMutation.isPending}
          />
          <div>
            <Label htmlFor="allowStudentPetitions" className="cursor-pointer">
              Allow students to create petitions
            </Label>
            <p id="student-petitions-help" className="text-xs text-muted-foreground">
              If disabled, only you (the professor) can create petitions in this classroom.
            </p>
          </div>
        </div>

        {errors.allowStudentPetitions && (
          <p id="student-petitions-error" role="alert">
            {errors.allowStudentPetitions}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {classroom
            ? "Your existing join code will stay the same."
            : "We’ll give you a join code to share with your students after you create the classroom."}
        </p>
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(classroom ? ROUTES.classroom(classroom.id) : ROUTES.classrooms)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </form>
    </Card>
  )
}

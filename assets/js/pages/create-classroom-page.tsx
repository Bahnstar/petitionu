import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, GraduationCap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { createClassroom, buildCSRFHeaders } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function CreateClassroomPage() {
  useDocumentTitle("New Classroom")

  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
          name: formData.name,
          description: formData.description || undefined,
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

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 max-w-2xl">
        {/* Back Link */}
        <Link
          to={ROUTES.classrooms}
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Classrooms
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 lg:w-10 lg:h-10" />
            Create Classroom
          </h1>
          <p className="text-muted-foreground">
            Create a new classroom for your students to collaborate on petitions
          </p>
        </div>

        {/* Form */}
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.general && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{errors.general}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Classroom Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., POLS 101 - Fall 2024"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={createMutation.isPending}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this classroom is about..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Optional. This will be visible to students who join the classroom.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowStudentPetitions"
                checked={formData.allowStudentPetitions}
                onChange={(e) =>
                  setFormData({ ...formData, allowStudentPetitions: e.target.checked })
                }
                disabled={createMutation.isPending}
                className="w-4 h-4 rounded border-border"
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

            <div className="flex justify-end gap-3 pt-4">
              <Link to={ROUTES.classrooms}>
                <Button type="button" variant="outline" disabled={createMutation.isPending}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Classroom"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  )
}

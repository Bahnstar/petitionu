import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { isUuid } from "@petitionu/domain"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api, serverError } from "@/lib/api"
import { ROUTES } from "@/lib/routes"
import { ClassroomForm, type ClassroomFormPayload } from "../features/classroom/classroom-form"
import type { ClassroomNotice } from "../features/classroom/classroom-notice"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function EditClassroomPage() {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // An id that isn't a UUID can't name a classroom: the page shows "Classroom not found".
  const validId = isUuid(id)

  const classroomQuery = useQuery({
    queryKey: ["classroom", id],
    queryFn: async () => {
      if (!validId) throw serverError([{ type: "not_found", message: "Classroom not found" }])
      const result = await api.getClassroomById({ id })
      if (result.success === false) throw serverError(result.errors, "Failed to fetch classroom")
      return result.data
    },
  })
  const classroom = classroomQuery.data
  useDocumentTitle(classroom ? `Edit ${classroom.name}` : "Edit classroom")

  const save = async (payload: ClassroomFormPayload) => {
    const result = await api.updateClassroom({ id, ...payload })
    if (result.success === false) throw serverError(result.errors, "Failed to save the classroom")
    return result.data
  }

  if (classroomQuery.isPending) {
    return (
      <main className="app-page" aria-busy="true">
        <p role="status" className="app-page-description">
          Loading the classroom…
        </p>
      </main>
    )
  }

  if (classroomQuery.isError || !classroom) {
    return (
      <main className="min-h-screen bg-background">
        <div className="app-page">
          <div className="app-empty-state" role="alert">
            <h1 className="mb-3 font-display text-3xl">This classroom couldn’t load</h1>
            <p className="text-destructive">Error: {classroomQuery.error?.message}</p>
            <Button onClick={() => navigate(ROUTES.classrooms)} className="mt-4">
              Back to classrooms
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const backLink = (
    <Link
      to={ROUTES.classroom(id)}
      className="mb-6 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back to {classroom.name}
    </Link>
  )

  // The server says who may edit, with the rule it enforces: the classroom's professor.
  if (!classroom.canManageClassroom) {
    return (
      <main className="min-h-screen bg-background">
        <div className="app-page !max-w-3xl">
          {backLink}
          <section id="edit-classroom-forbidden" className="app-empty-state">
            <h1 className="app-page-heading">Only the professor can edit this classroom.</h1>
            <p className="app-page-description">
              Ask the classroom’s professor if its name, description or petition setting should
              change.
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page !max-w-3xl">
        {backLink}
        <div className="mb-8">
          <h1 className="app-page-heading mb-3">Edit classroom</h1>
          <p className="app-page-description">
            Changes show to everyone in the classroom as soon as you save them.
          </p>
        </div>

        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <ClassroomForm
            // A fresh form for each classroom, so it never keeps another's values.
            key={classroom.id}
            id="edit-classroom-form"
            initial={{
              name: classroom.name,
              description: classroom.description ?? "",
              allowStudentPetitions: classroom.allowStudentPetitions,
            }}
            save={save}
            onSaved={(saved) => {
              queryClient.setQueryData(["classroom", saved.id], saved)
              queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
              const notice: ClassroomNotice = { kind: "updated" }
              navigate(ROUTES.classroom(saved.id), { state: notice })
            }}
            onCancel={() => navigate(ROUTES.classroom(id))}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </Card>
      </div>
    </main>
  )
}

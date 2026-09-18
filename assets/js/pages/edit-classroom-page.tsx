import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { getClassroomById, buildCSRFHeaders } from "@/js/ash_rpc"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"
import { useAuth } from "../contexts/auth-context"
import { useDocumentTitle } from "../hooks/use-document-title"
import { ClassroomForm } from "../features/classroom/classroom-form"

export default function EditClassroomPage() {
  useDocumentTitle("Classroom settings")
  const { id } = useParams<{ id: string }>()
  const { user, isLoading } = useAuth()
  const query = useQuery({
    queryKey: ["classroomSettings", id, user?.id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const result = await getClassroomById({
        input: { id: id! },
        fields: ["id", "name", "description", "allowStudentPetitions", "professorId"],
        headers: buildCSRFHeaders(),
      })
      if (!result.success) throw new Error("Classroom settings couldn’t load.")
      return result.data
    },
  })
  if (isLoading || (user && query.isPending))
    return (
      <main className="app-page" role="status">
        Loading classroom settings…
      </main>
    )
  if (query.isError)
    return (
      <main className="app-page">
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Try again</Button>
      </main>
    )
  if (!user || query.data?.professorId !== user.id)
    return (
      <main className="app-page">
        <h1 className="app-page-heading">Classroom settings unavailable</h1>
        <p>Only the classroom’s professor can edit its settings.</p>
        <Button asChild>
          <Link to={ROUTES.classrooms}>Back to classrooms</Link>
        </Button>
      </main>
    )

  return (
    <main className="app-page !max-w-3xl">
      <Link to={ROUTES.classroom(id!)} className="underline">
        Back to classroom
      </Link>
      <h1 className="app-page-heading my-8">Classroom settings</h1>
      <ClassroomForm key={query.data.id} classroom={query.data} />
    </main>
  )
}

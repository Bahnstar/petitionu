import { AuthLink } from "../components/auth-link"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMyClassrooms, buildCSRFHeaders } from "@/js/ash_rpc"
import { ClassroomList } from "../features/classroom/classroom-list"
import { JoinClassroomForm } from "../features/classroom/join-classroom-form"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

// Skeleton loading state
function ClassroomsLoadingState() {
  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        {/* Header Skeleton */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 h-10 w-48 animate-pulse rounded-lg bg-muted lg:h-12" />
            <div className="h-4 w-full max-w-72 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-6">
                  <div className="mb-4 h-6 w-24 animate-pulse rounded-lg bg-muted" />
                  <div className="mb-2 h-6 w-3/4 animate-pulse rounded-lg bg-muted" />
                  <div className="mb-4 h-4 w-full animate-pulse rounded-lg bg-muted" />
                  <div className="flex gap-4">
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 h-6 w-32 animate-pulse rounded-lg bg-muted" />
              <div className="mb-4 h-10 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ClassroomsPage() {
  useDocumentTitle("Classrooms")

  const { user: currentUser, isLoading: authLoading } = useAuth()
  const currentUserId = currentUser?.id

  const classroomsQuery = useQuery({
    queryKey: ["myClassrooms", currentUserId],
    queryFn: async () => {
      const result = await getMyClassrooms({
        fields: [
          "id",
          "name",
          "description",
          "joinCode",
          "archived",
          "allowStudentPetitions",
          "memberCount",
          "petitionCount",
          "professorId",
          { professor: ["id", "firstName", "lastName"] },
        ],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to fetch classrooms")
      }

      return result.data
    },
    enabled: !authLoading && !!currentUserId,
  })

  if (authLoading) return <ClassroomsLoadingState />

  if (!currentUser) {
    return (
      <main className="app-page">
        <section id="classrooms-sign-in" className="app-empty-state">
          <h1 className="app-page-heading">Find your people.</h1>
          <p className="app-page-description">
            Sign in to join your class, share ideas, and see what you can change together.
          </p>
          <Button asChild className="mt-6">
            <AuthLink>Sign in</AuthLink>
          </Button>
        </section>
      </main>
    )
  }

  if (classroomsQuery.isPending) {
    return <ClassroomsLoadingState />
  }

  if (classroomsQuery.isError) {
    return (
      <main className="min-h-screen bg-background">
        <div className="app-page">
          <div className="app-empty-state" role="alert">
            <h1 className="mb-3 font-display text-3xl">Your classrooms couldn’t load</h1>
            <p className="text-destructive">Error: {classroomsQuery.error?.message}</p>
            <Button onClick={() => classroomsQuery.refetch()} className="mt-4">
              Try again
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const classrooms = classroomsQuery.data || []
  const ownedClassrooms = classrooms.filter((c) => c.professorId === currentUserId)
  const memberClassrooms = classrooms.filter((c) => c.professorId !== currentUserId)

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="app-page-heading mb-3">My classrooms</h1>
            <p className="app-page-description">
              A shared space for your class and the ideas you care about.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <a href="#join-code">Join with a code</a>
            </Button>
            {(currentUser.role === "professor" || currentUser.role === "admin") && (
              <Button asChild id="create-classroom-link">
                <Link to={ROUTES.classroomNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create classroom
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Left Column - Classrooms */}
          <div className="space-y-8 lg:col-span-2">
            {/* Owned Classrooms */}
            {ownedClassrooms.length > 0 && (
              <section>
                <h2 className="mb-4 font-display text-3xl font-normal text-foreground">
                  Classrooms you teach
                </h2>
                <ClassroomList classrooms={ownedClassrooms} currentUserId={currentUserId} />
              </section>
            )}

            {/* Member Classrooms */}
            <section>
              <h2 className="mb-4 font-display text-3xl font-normal text-foreground">
                Classrooms you’ve joined
              </h2>
              <ClassroomList
                classrooms={memberClassrooms}
                currentUserId={currentUserId}
                emptyMessage="Ask your professor for a join code, then enter it here to find your class."
              />
            </section>
          </div>

          {/* Right Column - Join Form */}
          <div>
            <JoinClassroomForm onSuccess={() => classroomsQuery.refetch()} />
          </div>
        </div>
      </div>
    </main>
  )
}

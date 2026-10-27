import { useState } from "react"
import { Archive, GraduationCap } from "lucide-react"
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
        <div className="flex flex-col-reverse gap-6">
          <div className="w-full">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
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
        </div>
      </div>
    </main>
  )
}

export default function ClassroomsPage() {
  useDocumentTitle("Classrooms")

  const { user: currentUser, isLoading: authLoading } = useAuth()
  const currentUserId = currentUser?.id
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(0)
  const [joinOpen, setJoinOpen] = useState<boolean | null>(() =>
    window.location.hash === "#join-code" ? true : null,
  )

  const classroomsQuery = useQuery({
    queryKey: ["myClassrooms", currentUserId, showArchived, page],
    queryFn: async () => {
      const result = await getMyClassrooms({
        filter: showArchived ? undefined : { archived: { eq: false } },
        sort: ["name", "id"],
        page: { limit: 12, offset: page * 12, count: true },
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

  const allClassroomsQuery = useQuery({
    queryKey: ["myClassrooms", currentUserId, "presence"],
    enabled: !!currentUserId && classroomsQuery.data?.count === 0 && !showArchived,
    queryFn: async () => {
      const result = await getMyClassrooms({
        fields: ["id"],
        page: { limit: 1, count: true },
        headers: buildCSRFHeaders(),
      })
      if (!result.success) throw new Error("Couldn’t check your classrooms")
      return result.data.count
    },
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

  const classrooms = classroomsQuery.data.results
  const ownedClassrooms = classrooms.filter((c) => c.professorId === currentUserId)
  const memberClassrooms = classrooms.filter((c) => c.professorId !== currentUserId)

  const canCreate = ["professor", "admin"].includes(currentUser.role)
  const firstClassroom =
    classroomsQuery.data.count === 0 && (showArchived || allClassroomsQuery.data === 0)
  const joinExpanded = joinOpen ?? firstClassroom

  function renderClassroomToolbar() {
    return (
      <>
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="app-page-heading mb-3">My classrooms</h1>
            <p className="app-page-description">
              {canCreate
                ? "Manage your classes and follow their petitions."
                : "Your classes and the ideas you’re working on together."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              aria-expanded={joinExpanded}
              aria-controls="classroom-join-panel"
              onClick={() => setJoinOpen(!joinExpanded)}
            >
              {joinExpanded ? "Close join form" : "Join with a code"}
            </Button>
            {canCreate && (
              <Button asChild id="create-classroom-link">
                <Link to={ROUTES.classroomNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create classroom
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <p className="text-sm text-muted-foreground">
            {classroomsQuery.data.count}{" "}
            {showArchived ? "classrooms, including archived" : "active classrooms"}
          </p>
          <Button
            variant="ghost"
            aria-pressed={showArchived}
            onClick={() => {
              setShowArchived(!showArchived)
              setPage(0)
            }}
          >
            <Archive className="size-4" aria-hidden="true" />
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>
      </>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        {renderClassroomToolbar()}
        <div className="space-y-8">
          <div id="classroom-join-panel" hidden={!joinExpanded}>
            {joinExpanded && (
              <JoinClassroomForm
                focusOnMount={joinOpen === true}
                onSuccess={() => {
                  setJoinOpen(true)
                  classroomsQuery.refetch()
                }}
              />
            )}
          </div>
          <div className="space-y-8">
            {classrooms.length === 0 && (
              <ClassroomEmptyState
                firstClassroom={firstClassroom}
                canCreate={canCreate}
                onJoin={() => setJoinOpen(true)}
              />
            )}
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
            {memberClassrooms.length > 0 && (
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
            )}
            <nav aria-label="Classroom pages" className="flex items-center gap-3">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>Page {page + 1}</span>
              <Button
                variant="outline"
                disabled={!classroomsQuery.data.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          </div>
        </div>
      </div>
    </main>
  )
}

function ClassroomEmptyState({
  firstClassroom,
  canCreate,
  onJoin,
}: {
  firstClassroom: boolean
  canCreate: boolean
  onJoin: () => void
}) {
  let guidance = "Check your archived classrooms or join a class with a code."
  if (firstClassroom)
    guidance = canCreate
      ? "Create a classroom for your students, or join an existing class with a code."
      : "Enter the code from your professor to join your first classroom."
  return (
    <section className="app-empty-state">
      <GraduationCap className="mx-auto mb-4 size-12 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-display text-3xl">
        {firstClassroom ? "Start your classroom community" : "No classrooms in this view"}
      </h2>
      <p className="mx-auto my-4 max-w-lg text-muted-foreground">{guidance}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {canCreate && (
          <Button asChild>
            <Link to={ROUTES.classroomNew}>Create classroom</Link>
          </Button>
        )}
        <Button variant="outline" onClick={onJoin}>
          Join with a code
        </Button>
      </div>
    </section>
  )
}

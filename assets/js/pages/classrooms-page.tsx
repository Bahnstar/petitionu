import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Plus, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMyClassrooms, buildCSRFHeaders } from "@/js/ash_rpc"
import { ClassroomList } from "../features/classroom/classroom-list"
import { JoinClassroomForm } from "../features/classroom/join-classroom-form"
import { useAuth } from "../contexts/auth-context"

// Skeleton loading state
function ClassroomsLoadingState() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header Skeleton */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <div className="h-10 lg:h-12 bg-muted rounded-lg w-48 mb-2 animate-pulse" />
            <div className="h-4 bg-muted rounded-lg w-72 animate-pulse" />
          </div>
          <div className="h-10 bg-muted rounded-lg w-40 animate-pulse" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-card rounded-lg border border-border p-6">
                  <div className="h-6 bg-muted rounded-lg w-24 mb-4 animate-pulse" />
                  <div className="h-6 bg-muted rounded-lg w-3/4 mb-2 animate-pulse" />
                  <div className="h-4 bg-muted rounded-lg w-full mb-4 animate-pulse" />
                  <div className="flex gap-4">
                    <div className="h-4 bg-muted rounded-lg w-24 animate-pulse" />
                    <div className="h-4 bg-muted rounded-lg w-24 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="h-6 bg-muted rounded-lg w-32 mb-4 animate-pulse" />
              <div className="h-10 bg-muted rounded-lg w-full mb-4 animate-pulse" />
              <div className="h-10 bg-muted rounded-lg w-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ClassroomsPage() {
  const { user: currentUser } = useAuth()
  const currentUserId = currentUser?.id

  const classroomsQuery = useQuery({
    queryKey: ["myClassrooms"],
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
  })

  if (classroomsQuery.isPending) {
    return <ClassroomsLoadingState />
  }

  if (classroomsQuery.isError) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="text-center py-12">
            <p className="text-destructive">Error: {classroomsQuery.error?.message}</p>
            <Button onClick={() => classroomsQuery.refetch()} className="mt-4">
              Try Again
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
              <GraduationCap className="w-8 h-8 lg:w-10 lg:h-10" />
              My Classrooms
            </h1>
            <p className="text-muted-foreground">
              View and manage your classrooms or join a new one
            </p>
          </div>
          <Link to="/ash-typescript/classrooms/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Create Classroom
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Classrooms */}
          <div className="lg:col-span-2 space-y-8">
            {/* Owned Classrooms */}
            {ownedClassrooms.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  Classrooms You Teach
                </h2>
                <ClassroomList
                  classrooms={ownedClassrooms}
                  currentUserId={currentUserId}
                />
              </section>
            )}

            {/* Member Classrooms */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                Classrooms You've Joined
              </h2>
              <ClassroomList
                classrooms={memberClassrooms}
                currentUserId={currentUserId}
                emptyMessage="You haven't joined any classrooms yet. Use a join code to get started!"
              />
            </section>
          </div>

          {/* Right Column - Join Form */}
          <div>
            <JoinClassroomForm
              onSuccess={() => classroomsQuery.refetch()}
            />
          </div>
        </div>
      </div>
    </main>
  )
}

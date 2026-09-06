import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { GraduationCap, Users, FileText, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getMyClassrooms, buildCSRFHeaders, ClassroomResourceSchema } from "@/js/ash_rpc"
import { CleanResource } from "@/lib/types"
import { ROUTES } from "@/lib/routes"

type Classroom = CleanResource<ClassroomResourceSchema>

interface MyClassroomsProps {
  limit?: number
  currentUserId?: string
}

export function MyClassrooms({ limit = 3, currentUserId }: MyClassroomsProps) {
  const classroomsQuery = useQuery({
    queryKey: ["myClassrooms", "summary"],
    queryFn: async () => {
      const result = await getMyClassrooms({
        fields: ["id", "name", "memberCount", "petitionCount", "professorId", "archived"],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to fetch classrooms")
      }

      return result.data
    },
  })

  // Loading state
  if (classroomsQuery.isPending) {
    return (
      <Card className="gap-0 rounded-2xl p-6 shadow-none">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-normal text-foreground">My classrooms</h2>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-muted p-3">
              <div className="mb-2 h-4 w-3/4 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  // Error state
  if (classroomsQuery.isError) {
    return (
      <Card className="gap-0 rounded-2xl p-6 shadow-none">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-normal text-foreground">My classrooms</h2>
        </div>
        <p role="alert" className="text-sm text-muted-foreground">
          Your classrooms couldn’t load.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => classroomsQuery.refetch()}>
          Try again
        </Button>
      </Card>
    )
  }

  const classrooms = classroomsQuery.data || []
  const activeClassrooms = classrooms.filter((c) => !c.archived)
  const displayClassrooms = activeClassrooms.slice(0, limit)

  return (
    <Card className="gap-0 rounded-2xl p-6 shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-normal text-foreground">My classrooms</h2>
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.classrooms}>
            View all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {displayClassrooms.length === 0 ? (
        <div className="py-6 text-center">
          <GraduationCap className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            You haven't joined any classrooms yet
          </p>
          <Button asChild size="sm">
            <Link to={ROUTES.classrooms}>Find your class</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {displayClassrooms.map((classroom: Classroom) => (
            <Link key={classroom.id} to={ROUTES.classroom(classroom.id)} className="block">
              <div className="border-b border-border py-4 transition-colors hover:bg-muted/50">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate font-medium text-foreground">{classroom.name}</h3>
                      {currentUserId === classroom.professorId && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          Professor
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {classroom.memberCount ?? 0} members
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {classroom.petitionCount ?? 0} petitions
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}

          {activeClassrooms.length > limit && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              +{activeClassrooms.length - limit} more classrooms
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

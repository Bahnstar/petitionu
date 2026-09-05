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
        fields: [
          "id",
          "name",
          "memberCount",
          "petitionCount",
          "professorId",
          "archived",
        ],
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-normal text-foreground">
            My classrooms
          </h2>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-3 bg-muted rounded-lg animate-pulse">
              <div className="h-4 bg-muted-foreground/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted-foreground/10 rounded w-1/2" />
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-normal text-foreground">
            My classrooms
          </h2>
        </div>
        <p role="alert" className="text-sm text-muted-foreground">Your classrooms couldn’t load.</p>
        <Button variant="outline" className="mt-4" onClick={() => classroomsQuery.refetch()}>Try again</Button>
      </Card>
    )
  }

  const classrooms = classroomsQuery.data || []
  const activeClassrooms = classrooms.filter((c) => !c.archived)
  const displayClassrooms = activeClassrooms.slice(0, limit)

  return (
    <Card className="gap-0 rounded-2xl p-6 shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-normal text-foreground">
          My classrooms
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.classrooms}>
            View all
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>

      {displayClassrooms.length === 0 ? (
        <div className="text-center py-6">
          <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            You haven't joined any classrooms yet
          </p>
          <Button asChild size="sm"><Link to={ROUTES.classrooms}>Find your class</Link></Button>
        </div>
      ) : (
        <div className="space-y-3">
          {displayClassrooms.map((classroom: Classroom) => (
            <Link
              key={classroom.id}
              to={ROUTES.classroom(classroom.id)}
              className="block"
            >
              <div className="py-4 border-b border-border hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">
                        {classroom.name}
                      </h3>
                      {currentUserId === classroom.professorId && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Professor
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {classroom.memberCount ?? 0} members
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {classroom.petitionCount ?? 0} petitions
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </div>
            </Link>
          ))}

          {activeClassrooms.length > limit && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              +{activeClassrooms.length - limit} more classrooms
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

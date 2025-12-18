import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { GraduationCap, Users, FileText, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getMyClassrooms, buildCSRFHeaders, ClassroomResourceSchema } from "@/js/ash_rpc"
import { CleanResource } from "@/lib/types"

type Classroom = CleanResource<ClassroomResourceSchema>

interface MyClassroomsProps {
  limit?: number
  currentUserId?: string
}

export function MyClassrooms({ limit = 3, currentUserId }: MyClassroomsProps) {
  const classroomsQuery = useQuery({
    queryKey: ["myClassrooms"],
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
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            My Classrooms
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
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            My Classrooms
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">Failed to load classrooms</p>
      </Card>
    )
  }

  const classrooms = classroomsQuery.data || []
  const activeClassrooms = classrooms.filter((c) => !c.archived)
  const displayClassrooms = activeClassrooms.slice(0, limit)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-5 h-5" />
          My Classrooms
        </h2>
        <Link to="/ash-typescript/classrooms">
          <Button variant="ghost" size="sm">
            View All
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      {displayClassrooms.length === 0 ? (
        <div className="text-center py-6">
          <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            You haven't joined any classrooms yet
          </p>
          <Link to="/ash-typescript/classrooms">
            <Button size="sm">Browse Classrooms</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayClassrooms.map((classroom: Classroom) => (
            <Link
              key={classroom.id}
              to={`/ash-typescript/classrooms/${classroom.id}`}
              className="block"
            >
              <div className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all">
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
                        {classroom.memberCount ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {classroom.petitionCount ?? 0}
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

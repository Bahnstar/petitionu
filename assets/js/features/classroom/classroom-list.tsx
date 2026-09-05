import { ClassroomCard, Classroom } from "./classroom-card"
import { Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"

interface ClassroomListProps {
  classrooms: Classroom[]
  currentUserId?: string
  showCreateButton?: boolean
  emptyMessage?: string
}

export function ClassroomList({
  classrooms,
  currentUserId,
  showCreateButton = false,
  emptyMessage = "No classrooms found",
}: ClassroomListProps) {
  if (classrooms.length === 0) {
    return (
      <div className="app-empty-state">
        <h3 className="font-display text-3xl mb-3">Your class belongs here.</h3>
        <p className="text-muted-foreground mb-4">{emptyMessage}</p>
        {showCreateButton && (
            <Button asChild>
              <Link to={ROUTES.classroomNew}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first classroom
              </Link>
            </Button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {classrooms.map((classroom) => (
        <ClassroomCard
          key={classroom.id}
          classroom={classroom}
          isOwner={currentUserId === classroom.professorId}
          showJoinCode={currentUserId === classroom.professorId}
        />
      ))}
    </div>
  )
}

import { ClassroomCard, Classroom } from "./classroom-card"
import { Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

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
      <div className="text-center py-12 bg-card rounded-lg border border-border">
        <p className="text-muted-foreground mb-4">{emptyMessage}</p>
        {showCreateButton && (
          <Link to="/ash-typescript/classrooms/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Classroom
            </Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

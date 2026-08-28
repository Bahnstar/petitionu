import { Link } from "react-router-dom"
import { Users, FileText, Archive, Copy, Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CleanResource } from "@/lib/types"
import { ClassroomResourceSchema } from "@/js/ash_rpc"
import { useState } from "react"
import { ROUTES } from "@/lib/routes"

export type Classroom = CleanResource<ClassroomResourceSchema>

interface ClassroomCardProps {
  classroom: Classroom
  isOwner?: boolean
  showJoinCode?: boolean
}

export function ClassroomCard({ classroom, isOwner = false, showJoinCode = false }: ClassroomCardProps) {
  const [copied, setCopied] = useState(false)

  const copyJoinCode = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(classroom.joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Link to={ROUTES.classroom(classroom.id)}>
      <Card className="p-6 hover:shadow-lg transition-all duration-300 hover:border-primary/50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            {isOwner && (
              <Badge variant="default" className="text-xs bg-primary text-primary-foreground">
                Professor
              </Badge>
            )}
            {classroom.archived && (
              <Badge variant="secondary" className="text-xs">
                <Archive className="w-3 h-3 mr-1" />
                Archived
              </Badge>
            )}
            {!classroom.allowStudentPetitions && (
              <Badge variant="outline" className="text-xs">
                Professor-only petitions
              </Badge>
            )}
          </div>
        </div>

        <h3 className="text-xl font-semibold text-foreground mb-2 text-balance leading-snug">
          {classroom.name}
        </h3>

        {classroom.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
            {classroom.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {classroom.memberCount ?? 0} members
          </span>
          <span className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            {classroom.petitionCount ?? 0} petitions
          </span>
        </div>

        {showJoinCode && isOwner && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Join Code</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyJoinCode}
                className="text-xs h-7 px-2"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>
            <code className="text-xs text-muted-foreground font-mono break-all">
              {classroom.joinCode}
            </code>
          </div>
        )}
      </Card>
    </Link>
  )
}

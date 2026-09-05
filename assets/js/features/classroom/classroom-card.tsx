import { useState } from "react"
import { Link } from "react-router-dom"
import { Users, FileText, Archive, Copy, Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CleanResource } from "@/lib/types"
import { ClassroomResourceSchema } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"

export type Classroom = CleanResource<ClassroomResourceSchema>

interface ClassroomCardProps {
  classroom: Classroom
  isOwner?: boolean
  showJoinCode?: boolean
}

export function ClassroomCard({ classroom, isOwner = false, showJoinCode = false }: ClassroomCardProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const copyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(classroom.joinCode)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

  return (
    <Card className="group h-full gap-0 rounded-2xl p-0 shadow-none transition-colors hover:border-primary/40">
      <Link to={ROUTES.classroom(classroom.id)} className="flex flex-1 flex-col rounded-2xl p-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <div className="mb-5 flex flex-wrap gap-2">
          {isOwner && <Badge variant="secondary" className="bg-[#f7e8d2] text-[#685649]">Professor</Badge>}
          {classroom.archived && <Badge variant="secondary"><Archive className="size-3" />Archived</Badge>}
          {!classroom.allowStudentPetitions && <Badge variant="outline">Professor-only petitions</Badge>}
        </div>
        <h3 className="mb-3 break-words font-display text-3xl font-normal leading-tight text-foreground group-hover:underline decoration-1 underline-offset-4">
          {classroom.name}
        </h3>
        <p className="mb-6 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {classroom.description || "A place to share ideas and make your case together."}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Users className="size-3.5" aria-hidden="true" />{classroom.memberCount ?? 0} members</span>
          <span className="flex items-center gap-1.5"><FileText className="size-3.5" aria-hidden="true" />{classroom.petitionCount ?? 0} petitions</span>
        </div>
      </Link>
      {showJoinCode && isOwner && (
        <div className="mx-6 border-t border-border py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Join code</span>
            <Button variant="ghost" size="sm" onClick={copyJoinCode} aria-label={`Copy join code for ${classroom.name}`}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span role="status">{copied ? "Copied" : "Copy code"}</span>
            </Button>
          </div>
          <code className="block select-all break-all text-xs text-muted-foreground">{classroom.joinCode}</code>
          {copyError && <p role="alert" className="mt-2 text-xs text-destructive">Couldn’t copy. Select the code above to copy it manually.</p>}
        </div>
      )}
    </Card>
  )
}

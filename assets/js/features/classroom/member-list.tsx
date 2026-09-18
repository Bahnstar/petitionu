import { useState } from "react"
import { Input } from "@/components/ui/input"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  approveMembership,
  removeFromClassroom,
  promoteToTa,
  demoteToStudent,
  buildCSRFHeaders,
  ClassroomMembershipResourceSchema,
} from "@/js/ash_rpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { CleanResource } from "@/lib/types"
import { Check, X, ChevronUp, ChevronDown, Loader2, User, Clock } from "lucide-react"

type Membership = CleanResource<ClassroomMembershipResourceSchema>

interface MemberListProps {
  memberships: Membership[]
  classroomId: string
  canManage?: boolean
  canChangeRoles?: boolean
}

export function MemberList({
  memberships,
  classroomId,
  canManage = false,
  canChangeRoles = false,
}: MemberListProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [pendingPage, setPendingPage] = useState(0)
  const [success, setSuccess] = useState("")

  const approveMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const result = await approveMembership({
        identity: membershipId,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to approve membership")
      }
      return result.data
    },
    onSuccess: () => {
      setSuccess("Membership approved.")
      queryClient.invalidateQueries({ queryKey: ["classroomMemberships", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      queryClient.invalidateQueries({ queryKey: ["pendingMemberships", classroomId] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const result = await removeFromClassroom({
        identity: membershipId,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to remove member")
      }
      return result.data
    },
    onSuccess: () => {
      setSuccess("Membership removed.")
      queryClient.invalidateQueries({ queryKey: ["classroomMemberships", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const promoteMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const result = await promoteToTa({
        identity: membershipId,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to promote to TA")
      }
      return result.data
    },
    onSuccess: () => {
      setSuccess("Member promoted to TA.")
      queryClient.invalidateQueries({ queryKey: ["classroomMemberships", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const demoteMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const result = await demoteToStudent({
        identity: membershipId,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to demote to student")
      }
      return result.data
    },
    onSuccess: () => {
      setSuccess("Member changed to student.")
      queryClient.invalidateQueries({ queryKey: ["classroomMemberships", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const matches = memberships.filter((m) =>
    (m.memberName || "Campus member").toLowerCase().includes(search.trim().toLowerCase()),
  )
  const pendingMembers = matches.filter((m) => m.status === "pending")
  const activeMembers = matches.filter((m) => m.status === "active")
  const activePage = Math.min(page, Math.max(0, Math.ceil(activeMembers.length / 10) - 1))
  const requestPage = Math.min(pendingPage, Math.max(0, Math.ceil(pendingMembers.length / 10) - 1))
  function pagination(current: number, total: number, change: (page: number) => void) {
    if (total <= 10) return null
    return (
      <nav aria-label="Member pages" className="mt-4 flex items-center gap-2">
        <Button variant="outline" disabled={current === 0} onClick={() => change(current - 1)}>
          Previous
        </Button>
        <span>
          {current + 1} / {Math.ceil(total / 10)}
        </span>
        <Button
          variant="outline"
          disabled={(current + 1) * 10 >= total}
          onClick={() => change(current + 1)}
        >
          Next
        </Button>
      </nav>
    )
  }

  const isLoading =
    approveMutation.isPending ||
    removeMutation.isPending ||
    promoteMutation.isPending ||
    demoteMutation.isPending

  const actionError =
    approveMutation.error || removeMutation.error || promoteMutation.error || demoteMutation.error

  return (
    <div className="space-y-6">
      <Input
        aria-label="Search members and requests"
        placeholder="Search members and requests"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(0)
          setPendingPage(0)
        }}
      />
      {success && <p role="status">{success}</p>}
      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 p-4 text-sm text-destructive"
        >
          {actionError.message}
        </p>
      )}
      {pendingMembers.length > 0 && canManage && (
        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <h3 className="mb-4 flex items-center gap-2 font-display text-2xl font-normal text-foreground">
            <Clock className="h-5 w-5 text-[#685649]" />
            Join requests ({pendingMembers.length})
          </h3>
          <div className="space-y-3">
            {pendingMembers.slice(requestPage * 10, (requestPage + 1) * 10).map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 first:border-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {membership.memberName || "Campus member"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    aria-label={`Approve ${membership.memberName || "member"}`}
                    onClick={() => approveMutation.mutate(membership.id)}
                    disabled={isLoading}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Decline ${membership.memberName || "member"}’s request`}
                    variant="outline"
                    onClick={() => removeMutation.mutate(membership.id)}
                    disabled={isLoading}
                  >
                    {removeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {pagination(requestPage, pendingMembers.length, setPendingPage)}
        </Card>
      )}

      <Card className="gap-0 rounded-2xl p-6 shadow-none">
        <h3 className="mb-4 flex items-center gap-2 font-display text-2xl font-normal text-foreground">
          <User className="h-5 w-5" />
          Members ({activeMembers.length})
        </h3>
        {activeMembers.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            {search
              ? "No members match your search."
              : "No members yet. Share the classroom code to invite your students."}
          </p>
        ) : (
          <div className="space-y-3">
            {activeMembers.slice(activePage * 10, (activePage + 1) * 10).map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 first:border-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {membership.memberName || "Campus member"}
                    </p>
                  </div>
                  <Badge variant={membership.role === "ta" ? "default" : "secondary"}>
                    {membership.role === "ta" ? "TA" : "Student"}
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    {canChangeRoles &&
                      (membership.role === "student" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promoteMutation.mutate(membership.id)}
                          disabled={isLoading}
                          title="Promote to TA"
                          aria-label={`Promote ${membership.memberName || "member"} to TA`}
                        >
                          {promoteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronUp className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => demoteMutation.mutate(membership.id)}
                          disabled={isLoading}
                          title="Demote to student"
                          aria-label={`Demote ${membership.memberName || "member"} to student`}
                        >
                          {demoteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(membership.id)}
                      disabled={isLoading}
                      title="Remove member"
                      aria-label={`Remove ${membership.memberName || "member"} from classroom`}
                    >
                      {removeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {pagination(activePage, activeMembers.length, setPage)}
      </Card>
    </div>
  )
}

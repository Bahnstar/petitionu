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
}

export function MemberList({
  memberships,
  classroomId,
  canManage = false,
}: MemberListProps) {
  const queryClient = useQueryClient()

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
      queryClient.invalidateQueries({ queryKey: ["classroomMemberships", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const pendingMembers = memberships.filter((m) => m.status === "pending")
  const activeMembers = memberships.filter((m) => m.status === "active")

  const isLoading =
    approveMutation.isPending ||
    removeMutation.isPending ||
    promoteMutation.isPending ||
    demoteMutation.isPending

  const actionError = approveMutation.error || removeMutation.error || promoteMutation.error || demoteMutation.error

  return (
    <div className="space-y-6">
      {actionError && <p role="alert" className="rounded-xl border border-destructive/20 p-4 text-sm text-destructive">{actionError.message}</p>}
      {pendingMembers.length > 0 && canManage && (
        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <h3 className="font-display text-2xl font-normal text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#685649]" />
            Join requests ({pendingMembers.length})
          </h3>
          <div className="space-y-3">
            {pendingMembers.map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 first:border-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="size-8 shrink-0 bg-secondary rounded-full flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {membership.user?.firstName} {membership.user?.lastName}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{membership.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    aria-label={`Approve ${membership.user?.firstName || "member"}`}
                    onClick={() => approveMutation.mutate(membership.id)}
                    disabled={isLoading}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Decline ${membership.user?.firstName || "member"}’s request`}
                    variant="outline"
                    onClick={() => removeMutation.mutate(membership.id)}
                    disabled={isLoading}
                  >
                    {removeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="gap-0 rounded-2xl p-6 shadow-none">
        <h3 className="font-display text-2xl font-normal text-foreground mb-4 flex items-center gap-2">
          <User className="w-5 h-5" />
          Members ({activeMembers.length})
        </h3>
        {activeMembers.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No members yet. Share the classroom code to invite your students.</p>
        ) : (
          <div className="space-y-3">
            {activeMembers.map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 first:border-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="size-8 shrink-0 bg-secondary rounded-full flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {membership.user?.firstName} {membership.user?.lastName}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{membership.user?.email}</p>
                  </div>
                  <Badge variant={membership.role === "ta" ? "default" : "secondary"}>
                    {membership.role === "ta" ? "TA" : "Student"}
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    {membership.role === "student" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => promoteMutation.mutate(membership.id)}
                        disabled={isLoading}
                        title="Promote to TA"
                        aria-label={`Promote ${membership.user?.firstName || "member"} to TA`}
                      >
                        {promoteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => demoteMutation.mutate(membership.id)}
                        disabled={isLoading}
                        title="Demote to student"
                        aria-label={`Demote ${membership.user?.firstName || "member"} to student`}
                      >
                        {demoteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(membership.id)}
                      disabled={isLoading}
                      title="Remove member"
                      aria-label={`Remove ${membership.user?.firstName || "member"} from classroom`}
                    >
                      {removeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

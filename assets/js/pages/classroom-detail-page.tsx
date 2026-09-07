import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Users,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Archive,
  Loader2,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getClassroomById,
  getClassroomPetitions,
  getMembershipsForClassroom,
  regenerateJoinCode,
  archiveClassroom,
  unarchiveClassroom,
  buildCSRFHeaders,
} from "@/js/ash_rpc"
import { MemberList } from "../features/classroom/member-list"
import { PetitionCard } from "../features/petition/petition-card"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

// Loading state component
function ClassroomDetailLoadingState() {
  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        <div className="mb-6 h-6 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="mb-2 h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="mb-8 h-4 w-full max-w-96 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-6">
                <div className="mb-4 h-6 w-48 animate-pulse rounded-lg bg-muted" />
                <div className="mb-2 h-4 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded-lg bg-muted" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6">
              <div className="mb-4 h-6 w-32 animate-pulse rounded-lg bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ClassroomDetailPage() {
  function renderPetitionHeading() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-normal text-foreground">Petitions</h2>
        {!classroom?.archived &&
          currentUser?.emailVerified &&
          currentUser.profileComplete &&
          (classroom?.allowStudentPetitions || isProfessor) && (
            <Button asChild>
              <Link to={ROUTES.createPetitionWithClassroom(id!)}>
                <Plus className="mr-2 h-4 w-4" />
                Start a petition
              </Link>
            </Button>
          )}
      </div>
    )
  }

  function renderParticipationNotice() {
    if (currentUser && (!currentUser.emailVerified || !currentUser.profileComplete)) {
      return (
        <p className="mb-6 rounded-xl bg-secondary p-4 text-sm">
          Confirm your email and{" "}
          <Link to="/ash-typescript/profile" className="font-medium underline underline-offset-4">
            complete your profile
          </Link>{" "}
          to participate.
        </p>
      )
    }
    return null
  }

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const { user: currentUser } = useAuth()

  const currentUserId = currentUser?.id

  // Fetch classroom details
  const classroomQuery = useQuery({
    queryKey: ["classroom", id],
    queryFn: async () => {
      const result = await getClassroomById({
        input: { id: id! },
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
        ],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to fetch classroom")
      }

      return result.data
    },
    enabled: !!id,
  })

  // Fetch petitions
  const petitionsQuery = useQuery({
    queryKey: ["classroomPetitions", id],
    queryFn: async () => {
      const result = await getClassroomPetitions({
        input: { classroomId: id! },
        fields: [
          "id",
          "title",
          "description",
          "status",
          "signaturesCount",
          "goal",
          "daysLeft",
          "trending",
          "author",
          "isAnonymous",
          "deadline",
          { category: ["id", "name", "color"] },
        ],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to fetch petitions")
      }

      return result.data
    },
    enabled: !!id,
  })

  // Fetch memberships
  const membershipsQuery = useQuery({
    queryKey: ["classroomMemberships", id],
    queryFn: async () => {
      const result = await getMembershipsForClassroom({
        input: { classroomId: id! },
        fields: ["id", "role", "status", "joinedAt", "memberName", { user: ["id"] }],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to fetch memberships")
      }

      return result.data
    },
    enabled: !!id,
  })

  useDocumentTitle(classroomQuery?.data?.name ?? "Classroom")

  // Regenerate join code mutation
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const result = await regenerateJoinCode({
        identity: id!,
        fields: ["joinCode"],
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to regenerate join code")
      }
      return result.data
    },
    onSuccess: () => {
      setCopied(false)
      queryClient.invalidateQueries({ queryKey: ["classroom", id] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  // Archive/unarchive mutations
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const result = await archiveClassroom({
        identity: id!,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to archive classroom")
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classroom", id] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      const result = await unarchiveClassroom({
        identity: id!,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to unarchive classroom")
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classroom", id] })
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
    },
  })

  const copyJoinCode = async () => {
    if (classroom?.joinCode) {
      try {
        await navigator.clipboard.writeText(classroom.joinCode)
        setCopied(true)
        setCopyError(false)
      } catch {
        setCopied(false)
        setCopyError(true)
      }
    }
  }

  if (classroomQuery.isPending) {
    return <ClassroomDetailLoadingState />
  }

  if (classroomQuery.isError) {
    return (
      <main className="min-h-screen bg-background">
        <div className="app-page">
          <div className="app-empty-state" role="alert">
            <h1 className="mb-3 font-display text-3xl">This classroom couldn’t load</h1>
            <p className="text-destructive">Error: {classroomQuery.error?.message}</p>
            <Button onClick={() => navigate(ROUTES.classrooms)} className="mt-4">
              Back to classrooms
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const classroom = classroomQuery.data
  const petitions = petitionsQuery.data || []
  const memberships = membershipsQuery.data || []
  const isProfessor = classroom?.professorId === currentUserId
  const isActiveTa =
    !!currentUserId &&
    memberships.some(
      (membership) =>
        membership.user?.id === currentUserId &&
        membership.role === "ta" &&
        membership.status === "active",
    )

  const canManage = isProfessor || isActiveTa

  function renderPetitions() {
    if (petitionsQuery.isPending) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border bg-card p-6">
              <div className="mb-4 h-6 w-3/4 rounded bg-muted" />
              <div className="mb-2 h-4 w-full rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      )
    }
    if (petitionsQuery.isError) {
      return (
        <div className="app-empty-state" role="alert">
          <p className="mb-4 text-sm text-destructive">
            Petitions couldn’t load. {petitionsQuery.error.message}
          </p>
          <Button variant="outline" onClick={() => petitionsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )
    }
    if (petitions.length === 0) {
      return (
        <Card className="gap-0 rounded-2xl p-8 text-center shadow-none">
          <h3 className="mb-3 font-display text-3xl">What could your class change?</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            No petitions here yet. Every shared idea starts with one voice.
          </p>
          {!classroom?.archived &&
            currentUser?.emailVerified &&
            currentUser.profileComplete &&
            (classroom?.allowStudentPetitions || isProfessor) && (
              <Button asChild>
                <Link to={ROUTES.createPetitionWithClassroom(id!)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Start the first petition
                </Link>
              </Button>
            )}
        </Card>
      )
    }
    return (
      <div className="grid gap-4">
        {petitions.map((petition) => (
          <PetitionCard key={petition.id} petition={petition} />
        ))}
      </div>
    )
  }

  function renderMembers() {
    if (membershipsQuery.isPending) {
      return (
        <Card className="gap-0 rounded-2xl p-6 shadow-none">
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="flex-1">
                  <div className="mb-1 h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )
    }
    if (membershipsQuery.isError) {
      return (
        <Card className="gap-0 rounded-2xl p-6 shadow-none" role="alert">
          <p className="mb-4 text-sm text-destructive">
            Members couldn’t load. {membershipsQuery.error.message}
          </p>
          <Button variant="outline" onClick={() => membershipsQuery.refetch()}>
            Try again
          </Button>
        </Card>
      )
    }
    return (
      <MemberList
        memberships={memberships}
        classroomId={id!}
        canManage={canManage}
        canChangeRoles={isProfessor}
      />
    )
  }

  function renderClassroomHeader() {
    return (
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="app-page-heading">{classroom?.name}</h1>
            {classroom?.archived && (
              <Badge variant="secondary">
                <Archive className="mr-1 h-3 w-3" />
                Archived
              </Badge>
            )}
          </div>
          {classroom?.description && (
            <p className="app-page-description max-w-2xl">{classroom.description}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {classroom?.memberCount ?? 0} members
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {classroom?.petitionCount ?? 0} petitions
            </span>
            <span>Led by your professor</span>
          </div>
        </div>

        {isProfessor && (
          <div className="flex items-center gap-2">
            {classroom?.archived ? (
              <Button
                onClick={() => unarchiveMutation.mutate()}
                disabled={unarchiveMutation.isPending}
              >
                {unarchiveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Unarchive
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
              >
                {archiveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Archive
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderJoinCode() {
    return (
      isProfessor && (
        <Card className="gap-0 rounded-2xl border-[#e8d9c3] bg-[#f7e8d2] p-6 shadow-none">
          <h3 className="mb-4 font-display text-2xl font-normal text-foreground">Join code</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Share this code with students to let them join the classroom.
          </p>
          <div className="mb-4 rounded-xl bg-white/70 p-4">
            <code className="text-sm break-all select-all">{classroom?.joinCode}</code>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyJoinCode}
              className="flex-1"
              aria-live="polite"
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              aria-label="Generate a new join code"
              title="Generate a new join code"
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#685649]">
            Generating a new code replaces this one. Share the new code with anyone who hasn’t
            joined yet.
          </p>
          {copyError && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              Couldn’t copy. Select the code above to copy it manually.
            </p>
          )}
          {regenerateMutation.error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {regenerateMutation.error.message}
            </p>
          )}
        </Card>
      )
    )
  }

  function renderArchiveError() {
    return (
      (archiveMutation.error || unarchiveMutation.error) && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {archiveMutation.error?.message || unarchiveMutation.error?.message}
        </p>
      )
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        {/* Back Link */}
        <Link
          to={ROUTES.classrooms}
          className="mb-6 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to classrooms
        </Link>

        {/* Header */}
        {renderClassroomHeader()}

        {renderArchiveError()}
        {renderParticipationNotice()}
        {classroom?.archived && (
          <p className="mb-6 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
            This classroom is archived. You can still browse its petitions and members.
          </p>
        )}

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Left Column - Petitions */}
          <div className="space-y-6 lg:col-span-2">
            {renderPetitionHeading()}

            {renderPetitions()}
          </div>

          {/* Right Column - Info & Members */}
          <div className="space-y-6">
            {/* Join code (Professor only) */}
            {renderJoinCode()}

            {/* Members */}
            {renderMembers()}
          </div>
        </div>
      </div>
    </main>
  )
}

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
        <div className="h-6 bg-muted rounded-lg w-32 mb-6 animate-pulse" />
        <div className="h-10 bg-muted rounded-lg w-64 mb-2 animate-pulse" />
        <div className="h-4 bg-muted rounded-lg w-full max-w-96 mb-8 animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border p-6">
                <div className="h-6 bg-muted rounded-lg w-48 mb-4 animate-pulse" />
                <div className="h-4 bg-muted rounded-lg w-full mb-2 animate-pulse" />
                <div className="h-4 bg-muted rounded-lg w-3/4 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border p-6">
              <div className="h-6 bg-muted rounded-lg w-32 mb-4 animate-pulse" />
              <div className="h-10 bg-muted rounded-lg w-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ClassroomDetailPage() {
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
          { professor: ["id", "firstName", "lastName", "email"] },
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
          { category: ["id", "name", "color"] },
          { user: ["id", "firstName", "lastName"] },
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
        fields: [
          "id",
          "role",
          "status",
          "joinedAt",
          { user: ["id", "firstName", "lastName", "email"] },
        ],
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
            <h1 className="font-display text-3xl mb-3">This classroom couldn’t load</h1>
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
  const canManage = isProfessor // TODO: Add TA check

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page">
        {/* Back Link */}
        <Link
          to={ROUTES.classrooms}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to classrooms
        </Link>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h1 className="app-page-heading">
                {classroom?.name}
              </h1>
              {classroom?.archived && (
                <Badge variant="secondary">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived
                </Badge>
              )}
            </div>
            {classroom?.description && (
              <p className="app-page-description max-w-2xl">{classroom.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {classroom?.memberCount ?? 0} members
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {classroom?.petitionCount ?? 0} petitions
              </span>
              <span>
                Professor: {classroom?.professor?.firstName} {classroom?.professor?.lastName}
              </span>
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
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4 mr-2" />
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
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4 mr-2" />
                  )}
                  Archive
                </Button>
              )}
            </div>
          )}
        </div>

        {(archiveMutation.error || unarchiveMutation.error) && (
          <p role="alert" className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {archiveMutation.error?.message || unarchiveMutation.error?.message}
          </p>
        )}
        {classroom?.archived && <p className="mb-6 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">This classroom is archived. You can still browse its petitions and members.</p>}

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Petitions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-3xl font-normal text-foreground">Petitions</h2>
              {(classroom?.allowStudentPetitions || isProfessor) && (
                  <Button asChild>
                    <Link to={ROUTES.createPetitionWithClassroom(id!)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Start a petition
                    </Link>
                  </Button>
              )}
            </div>

            {petitionsQuery.isPending ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-card rounded-2xl border p-6 animate-pulse">
                    <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                    <div className="h-4 bg-muted rounded w-full mb-2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : petitionsQuery.isError ? (
              <div className="app-empty-state" role="alert">
                <p className="text-sm text-destructive mb-4">Petitions couldn’t load. {petitionsQuery.error.message}</p>
                <Button variant="outline" onClick={() => petitionsQuery.refetch()}>Try again</Button>
              </div>
            ) : petitions.length === 0 ? (
              <Card className="gap-0 rounded-2xl p-8 text-center shadow-none">
                <h3 className="font-display text-3xl mb-3">What could your class change?</h3>
                <p className="text-sm text-muted-foreground mb-6">No petitions here yet. Every shared idea starts with one voice.</p>
                {(classroom?.allowStudentPetitions || isProfessor) && (
                    <Button asChild>
                      <Link to={ROUTES.createPetitionWithClassroom(id!)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Start the first petition
                      </Link>
                    </Button>
                )}
              </Card>
            ) : (
              <div className="grid gap-4">
                {petitions.map((petition) => (
                  <PetitionCard key={petition.id} petition={petition} />
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Info & Members */}
          <div className="space-y-6">
            {/* Join code (Professor only) */}
            {isProfessor && (
              <Card className="gap-0 rounded-2xl border-[#e8d9c3] bg-[#f7e8d2] p-6 shadow-none">
                <h3 className="font-display text-2xl font-normal text-foreground mb-4">Join code</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Share this code with students to let them join the classroom.
                </p>
                <div className="bg-white/70 rounded-xl p-4 mb-4">
                  <code className="select-all text-sm break-all">{classroom?.joinCode}</code>
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
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
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
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#685649]">Generating a new code replaces this one. Share the new code with anyone who hasn’t joined yet.</p>
                {copyError && <p role="alert" className="mt-3 text-xs text-destructive">Couldn’t copy. Select the code above to copy it manually.</p>}
                {regenerateMutation.error && <p role="alert" className="mt-3 text-xs text-destructive">{regenerateMutation.error.message}</p>}
              </Card>
            )}

            {/* Members */}
            {membershipsQuery.isPending ? (
              <Card className="gap-0 rounded-2xl p-6 shadow-none">
                <div className="h-6 bg-muted rounded w-32 mb-4 animate-pulse" />
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-3/4 mb-1 animate-pulse" />
                        <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : membershipsQuery.isError ? (
              <Card className="gap-0 rounded-2xl p-6 shadow-none" role="alert">
                <p className="mb-4 text-sm text-destructive">Members couldn’t load. {membershipsQuery.error.message}</p>
                <Button variant="outline" onClick={() => membershipsQuery.refetch()}>Try again</Button>
              </Card>
            ) : (
              <MemberList
                memberships={memberships}
                classroomId={id!}
                canManage={canManage}
                isProfessor={isProfessor}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

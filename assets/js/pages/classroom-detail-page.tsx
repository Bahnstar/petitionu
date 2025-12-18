import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Settings,
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

// Loading state component
function ClassroomDetailLoadingState() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="h-6 bg-muted rounded-lg w-32 mb-6 animate-pulse" />
        <div className="h-10 bg-muted rounded-lg w-64 mb-2 animate-pulse" />
        <div className="h-4 bg-muted rounded-lg w-96 mb-8 animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-lg border p-6">
                <div className="h-6 bg-muted rounded-lg w-48 mb-4 animate-pulse" />
                <div className="h-4 bg-muted rounded-lg w-full mb-2 animate-pulse" />
                <div className="h-4 bg-muted rounded-lg w-3/4 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6">
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
      queryClient.invalidateQueries({ queryKey: ["classroom", id] })
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
      await navigator.clipboard.writeText(classroom.joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (classroomQuery.isPending) {
    return <ClassroomDetailLoadingState />
  }

  if (classroomQuery.isError) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="text-center py-12">
            <p className="text-destructive">Error: {classroomQuery.error?.message}</p>
            <Button onClick={() => navigate("/ash-typescript/classrooms")} className="mt-4">
              Back to Classrooms
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Back Link */}
        <Link
          to="/ash-typescript/classrooms"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Classrooms
        </Link>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
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
              <p className="text-muted-foreground max-w-2xl">{classroom.description}</p>
            )}
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
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
              <Link to={`/ash-typescript/classrooms/${id}/edit`}>
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
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

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Petitions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Petitions</h2>
              {(classroom?.allowStudentPetitions || isProfessor) && (
                <Link to={`/ash-typescript/create?classroomId=${id}`}>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Petition
                  </Button>
                </Link>
              )}
            </div>

            {petitionsQuery.isPending ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-card rounded-lg border p-6 animate-pulse">
                    <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                    <div className="h-4 bg-muted rounded w-full mb-2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : petitions.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No petitions in this classroom yet</p>
                {(classroom?.allowStudentPetitions || isProfessor) && (
                  <Link to={`/ash-typescript/create?classroomId=${id}`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create the First Petition
                    </Button>
                  </Link>
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
            {/* Join Code (Professor only) */}
            {isProfessor && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Join Code</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Share this code with students to let them join the classroom.
                </p>
                <div className="bg-muted rounded-lg p-3 mb-3">
                  <code className="text-xs font-mono break-all">{classroom?.joinCode}</code>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyJoinCode}
                    className="flex-1"
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
                  >
                    {regenerateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Members */}
            {membershipsQuery.isPending ? (
              <Card className="p-6">
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

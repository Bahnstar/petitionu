import { mutatePetition } from "../features/petition/petition-mutations"
import { ReportContent } from "../features/moderation/report-content"
import { useCurrentTime } from "../hooks/use-current-time"
import { AuthLink } from "../components/auth-link"
import { useEffect, useRef, useState } from "react"
import { formatDate } from "@/lib/utils"
import { Link, useParams } from "react-router-dom"
import { buildCSRFHeaders, getPetitionById, type GetPetitionByIdFields } from "../ash_rpc"
import { PetitionOwnerControls } from "../features/petition/petition-owner-controls"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"

async function loadPetition(id: string, authenticated: boolean) {
  const result = await getPetitionById({
    input: { id },
    fields: [
      "id",
      "title",
      "description",
      "status",
      "classroomId",
      "organizationId",
      "hasSigned",
      "canManage",
      "goal",
      "signaturesCount",
      "daysLeft",
      "trending",
      "author",
      "allowComments",
      "isAnonymous",
      "deadline",
      "insertedAt",
      { category: ["id", "name"] },
      ...(authenticated
        ? ([
            { comments: ["id", "text", "insertedAt", "author"] },
            { signatures: ["id", "reason", "insertedAt"] },
            { updates: ["id", "title", "body", "insertedAt"] },
          ] satisfies GetPetitionByIdFields)
        : []),
    ] as const satisfies GetPetitionByIdFields,
    headers: buildCSRFHeaders(),
  })
  if (result.success === false)
    throw new Error("This petition couldn't be loaded. Please try again.")
  return result.data ?? null
}

type Petition = NonNullable<Awaited<ReturnType<typeof loadPetition>>>

// On phones the signing panel sits after the comments, so a fixed bar keeps the count and the
// sign action reachable. It hides once the panel itself is on screen.
function MobileSignBar({
  signed,
  count,
  goal,
  panelId,
  onShare,
}: {
  signed: boolean
  count: number
  goal: number
  panelId: string
  onShare: () => void
}) {
  const [panelVisible, setPanelVisible] = useState(false)
  const observed = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    const panel = document.getElementById(panelId)
    if (!panel || typeof IntersectionObserver === "undefined") return
    observed.current = new IntersectionObserver(
      ([entry]) => setPanelVisible(entry.isIntersecting),
      {
        threshold: 0.2,
      },
    )
    observed.current.observe(panel)
    return () => observed.current?.disconnect()
  }, [panelId])
  return (
    <div id="petition-sign-bar" className="app-sign-bar" data-hidden={panelVisible}>
      <p className="min-w-0 text-sm leading-tight">
        <strong className="font-display text-2xl font-normal">{count.toLocaleString()}</strong>{" "}
        <span className="text-muted-foreground">
          {goal > 0 ? `of ${goal.toLocaleString()} signatures` : "signatures"}
        </span>
      </p>
      {signed ? (
        <Button variant="outline" onClick={onShare}>
          <span className="hero-arrow-up-tray size-4" aria-hidden="true" />
          Share
        </Button>
      ) : (
        <Button asChild>
          <a href={`#${panelId}`}>Sign this petition</a>
        </Button>
      )}
    </div>
  )
}

function PetitionContent({ petition }: { petition: Petition }) {
  function renderPetitionMetadata() {
    return (
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-6 text-muted-foreground">
        <span>
          Started by{" "}
          {petition.isAnonymous ? "Anonymous" : petition.author || "a campus community member"}
        </span>
        {petition.insertedAt ? <span>{formatDate(petition.insertedAt)}</span> : null}
      </div>
    )
  }

  const now = useCurrentTime()
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState("")
  const [signatureReason, setSignatureReason] = useState("")
  const [shareMessage, setShareMessage] = useState("")
  const [sharePending, setSharePending] = useState(false)
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user?.emailVerified || !user.profileComplete)
        throw new Error("Complete your profile before commenting.")
      return mutatePetition(queryClient, { kind: "comment", petition, text })
    },
    onSuccess: () => {
      setCommentText("")
    },
  })
  const signatureMutation = useMutation({
    mutationFn: async () => {
      if (!user?.emailVerified || !user.profileComplete)
        throw new Error("Complete your profile before signing.")
      return mutatePetition(queryClient, { kind: "sign", petition, reason: signatureReason })
    },
    onSuccess: () => {
      setSignatureReason("")
    },
  })
  const sharePetition = async () => {
    setShareMessage("")
    setSharePending(true)
    try {
      const url = window.location.href
      if (navigator.share) {
        await navigator.share({ title: petition.title ?? "Support this petition", url })
      } else {
        await navigator.clipboard.writeText(url)
        setShareMessage("Link copied. Share it with your people.")
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setShareMessage("Copy the link from your browser's address bar to share this petition.")
    } finally {
      setSharePending(false)
    }
  }
  const signatures = petition.signatures ?? []
  const comments = petition.comments ?? []
  const updates = petition.updates ?? []
  const signatureCount = petition.signaturesCount ?? 0
  const goal = petition.goal ?? 0
  const progress = goal > 0 ? Math.min(100, Math.max(0, (signatureCount / goal) * 100)) : 0
  const daysLeft = petition.deadline
    ? Math.max(0, Math.ceil((new Date(petition.deadline).getTime() - now) / 86_400_000))
    : null
  const closed =
    petition.status !== "open" ||
    !!(petition.deadline && new Date(petition.deadline).getTime() <= now)
  const canParticipate = !!(user?.emailVerified && user.profileComplete)
  const signed = signatureMutation.isSuccess || petition.hasSigned

  function renderBackLink() {
    return (
      <Link
        to={user ? ROUTES.petitions : ROUTES.home}
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <span className="hero-arrow-left size-4" aria-hidden="true" />
        {user ? "Browse petitions" : "Home"}
      </Link>
    )
  }

  // Signatures are anonymous, so the list shows reasons rather than a repeated placeholder name.
  function renderReasons() {
    const reasons = [...signatures]
      .filter((signature) => signature.reason?.trim())
      .sort((a, b) => (b.insertedAt ?? "").localeCompare(a.insertedAt ?? ""))
      .slice(0, 5)
    if (signatures.length === 0)
      return (
        <p className="text-sm leading-7 text-muted-foreground">
          {closed
            ? "This petition closed without signatures."
            : "Be the first to stand behind this idea."}
        </p>
      )
    if (reasons.length === 0)
      return (
        <p className="text-sm leading-7 text-muted-foreground">
          {signatureCount.toLocaleString()} {signatureCount === 1 ? "person has" : "people have"}{" "}
          signed. No one has shared a reason yet.
        </p>
      )
    return (
      <ul className="petition-reasons">
        {reasons.map((signature) => (
          <li key={signature.id}>
            <blockquote className="break-words whitespace-pre-wrap">
              “{signature.reason}”
            </blockquote>
            <p>Signed {formatDate(signature.insertedAt)}</p>
          </li>
        ))}
      </ul>
    )
  }

  function renderActivity() {
    return user ? (
      <>
        <section aria-labelledby="petition-supporters-heading">
          <h2 id="petition-supporters-heading" className="petition-section-heading mb-6">
            Why people signed
            <small>{signatureCount.toLocaleString()} signed</small>
          </h2>
          {renderReasons()}
        </section>
        <ReportContent petitionId={petition.id} />
        <section id="petition-comments" aria-labelledby="petition-comments-heading">
          <h2 id="petition-comments-heading" className="petition-section-heading mb-6">
            Conversation
            <small>{comments.length}</small>
          </h2>
          {renderCommentForm()}
          <div className="petition-thread">
            {comments.map((comment) => (
              <div key={comment.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {comment.author || "A campus community member"}
                  </span>
                  {comment.insertedAt ? (
                    <span className="text-muted-foreground">{formatDate(comment.insertedAt)}</span>
                  ) : null}
                </div>
                <p className="text-sm leading-7 break-words whitespace-pre-wrap">{comment.text}</p>
                <ReportContent petitionId={petition.id} commentId={comment.id} />
              </div>
            ))}
          </div>
        </section>
      </>
    ) : null
  }

  function renderStatusBadge() {
    if (petition.status === "victory") {
      return <span className="rounded-full bg-[#f5cfdc] px-3 py-1.5 text-[#663e51]">Victory</span>
    }
    if (closed) {
      return <span className="rounded-full border border-border px-3 py-1.5">Closed</span>
    }
    if (petition.trending) {
      return (
        <span className="rounded-full bg-[#f7e8d2] px-3 py-1.5 text-[#685649]">
          Gathering support
        </span>
      )
    }
    return null
  }

  function renderCommentForm() {
    if (petition.allowComments) {
      if (closed)
        return (
          <p className="mb-6 text-sm text-muted-foreground">
            This petition is no longer accepting comments.
          </p>
        )
      if (user && !canParticipate) return renderParticipationMessage("comment")
      if (user) {
        return (
          <form
            id="petition-comment-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (commentText.trim() && !commentMutation.isPending)
                commentMutation.mutate(commentText.trim())
            }}
            className="app-panel mb-6 space-y-4"
          >
            <Label htmlFor="petition-comment">Add to the conversation</Label>
            <Textarea
              id="petition-comment"
              placeholder="Share a thought, a question, or why this matters to you."
              rows={4}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              required
              className="resize-y"
            />
            {commentMutation.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {commentMutation.error.message}
              </p>
            ) : null}
            {commentMutation.isSuccess ? (
              <p role="status" className="text-sm text-muted-foreground">
                Your comment has been posted.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Keep it respectful and constructive.</p>
              <Button
                id="post-comment"
                type="submit"
                disabled={!commentText.trim() || commentMutation.isPending}
              >
                {commentMutation.isPending ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </form>
        )
      }
      return (
        <p className="mb-6 text-sm text-muted-foreground">
          <AuthLink className="font-medium text-primary underline underline-offset-4">
            Sign in
          </AuthLink>{" "}
          to join the conversation.
        </p>
      )
    }
    return (
      <p className="mb-6 text-sm text-muted-foreground">
        Comments are turned off for this petition.
      </p>
    )
  }

  function signatureHeading() {
    if (signed) {
      return "You're part of this."
    }
    if (closed) {
      return "A shared idea."
    }
    return "Add your voice."
  }

  function renderParticipationMessage(action: string) {
    return (
      <p className="mb-6 text-sm leading-7 text-muted-foreground">
        Confirm your email and{" "}
        <Link to="/ash-typescript/profile" className="font-medium underline underline-offset-4">
          complete your profile
        </Link>{" "}
        to {action}.
      </p>
    )
  }

  function renderSignatureForm() {
    if (signed) {
      return (
        <div role="status" className="text-sm leading-7">
          <span
            className="mr-2 hero-check-circle size-5 align-middle text-primary"
            aria-hidden="true"
          />
          Your signature is counted. Help this idea reach more people by sharing it.
        </div>
      )
    }
    if (closed) {
      return (
        <p className="text-sm leading-7 text-muted-foreground">
          {petition.status === "victory"
            ? "This petition has been marked as a victory. Thank you to everyone who spoke up."
            : "This petition is no longer accepting signatures."}
        </p>
      )
    }
    if (authLoading) {
      return (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your account…
        </p>
      )
    }
    if (user && !canParticipate) return renderParticipationMessage("sign this petition")
    if (user) {
      return (
        <form
          id="sign-petition-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!signatureMutation.isPending) signatureMutation.mutate()
          }}
        >
          <p className="text-sm text-muted-foreground">
            Signing as{" "}
            <span className="font-medium text-foreground">{user.firstName || user.email}</span>
          </p>
          <Label htmlFor="signature-reason">
            Why are you signing?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="signature-reason"
            rows={3}
            value={signatureReason}
            onChange={(event) => setSignatureReason(event.target.value)}
            placeholder="Tell your community why this matters."
          />
          {signatureMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {signatureMutation.error.message}
            </p>
          ) : null}
          <Button
            id="sign-petition"
            type="submit"
            className="w-full"
            disabled={signatureMutation.isPending}
          >
            {signatureMutation.isPending ? "Adding your signature…" : "Sign this petition"}
          </Button>
          <p className="text-xs leading-6 text-muted-foreground">
            Your reason for signing will appear on this petition.
          </p>
        </form>
      )
    }
    return (
      <div className="space-y-4">
        <p className="text-sm leading-7 text-muted-foreground">
          Sign in to stand behind this idea and add your signature.
        </p>
        <Button className="w-full" asChild>
          <AuthLink id="sign-petition">Sign this petition</AuthLink>
        </Button>
      </div>
    )
  }

  // One hundred marks stand for the goal; each fills as signatures arrive. The reader's own
  // signature is the newest mark, in rose.
  function renderMarks() {
    const filled = Math.round(progress)
    return (
      <div
        role="progressbar"
        aria-label="Signature goal"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
        className="petition-marks"
      >
        {Array.from({ length: 100 }, (_, index) => (
          <i
            key={index}
            data-filled={index < filled}
            data-you={signed && filled > 0 && index === filled - 1 ? "true" : undefined}
          />
        ))}
      </div>
    )
  }

  function tallyNote() {
    if (goal > 0 && signatureCount >= goal) return "Goal reached."
    if (goal > 0 && petition.deadline && !closed)
      return `${Math.round(progress)}% of the way there, ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left.`
    if (goal > 0) return `${Math.round(progress)}% of the way there.`
    if (petition.deadline && !closed) return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left.`
    return "Every signature counts."
  }

  function renderSignaturePanel() {
    return (
      <section
        id="petition-signature-panel"
        className="petition-tally"
        aria-labelledby="petition-tally-heading"
      >
        <h2 id="petition-tally-heading" className="mb-4 text-sm font-medium">
          {signatureHeading()}
        </h2>
        <p className="petition-tally-count">
          <strong>{signatureCount.toLocaleString()}</strong>
          <span>{goal > 0 ? `of ${goal.toLocaleString()} signatures` : "signatures"}</span>
        </p>
        {goal > 0 ? renderMarks() : null}
        <p className="petition-tally-note">{tallyNote()}</p>
        <div className="petition-tally-form">{renderSignatureForm()}</div>
      </section>
    )
  }

  return (
    <main id="petition-detail-page" className="app-page pb-28 lg:pb-20">
      {renderBackLink()}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
        <article className="min-w-0 space-y-12">
          <header className="petition-hero">
            <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1.5">
                {petition.category?.name ?? "General"}
              </span>
              {renderStatusBadge()}
            </div>
            <h1 className="petition-title break-words">{petition.title}</h1>
            {renderPetitionMetadata()}
            <p className="petition-body break-words whitespace-pre-wrap">{petition.description}</p>
          </header>
          {petition.canManage ? (
            <PetitionOwnerControls petition={petition} canPublishUpdate={canParticipate} />
          ) : null}
          {updates.length > 0 ? (
            <section aria-labelledby="petition-updates-heading">
              <h2 id="petition-updates-heading" className="petition-section-heading mb-6">
                Updates
                <small>{updates.length}</small>
              </h2>
              <ol className="petition-timeline">
                {updates.map((update) => (
                  <li key={update.id}>
                    <time dateTime={update.insertedAt ?? undefined}>
                      {formatDate(update.insertedAt)}
                    </time>
                    <div>
                      <h3>{update.title}</h3>
                      <p className="break-words whitespace-pre-wrap">{update.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {renderActivity()}
        </article>
        <aside className="lg:sticky lg:top-8">
          {renderSignaturePanel()}
          <Button
            id="share-petition"
            variant="outline"
            className="mt-4 w-full"
            disabled={sharePending}
            onClick={sharePetition}
          >
            <span className="hero-arrow-up-tray size-4" aria-hidden="true" />
            Share this petition
          </Button>
          {shareMessage ? (
            <p role="status" className="mt-3 text-center text-xs leading-6 text-muted-foreground">
              {shareMessage}
            </p>
          ) : null}
        </aside>
      </div>
      {!closed && !authLoading ? (
        <MobileSignBar
          signed={!!signed}
          count={signatureCount}
          goal={goal}
          panelId="petition-signature-panel"
          onShare={sharePetition}
        />
      ) : null}
    </main>
  )
}

export default function PetitionIndexPage() {
  const { id } = useParams()
  const { user, isLoading: authLoading } = useAuth()
  const petitionQuery = useQuery({
    queryKey: ["petition", id, user?.id ?? null],
    enabled: !authLoading && !!id,
    queryFn: () => {
      if (!id) throw new Error("Missing petition ID")
      return loadPetition(id, !!user)
    },
  })
  useDocumentTitle(petitionQuery.data?.title ?? "Petition")
  if (petitionQuery.isPending)
    return (
      <main role="status" className="app-page" aria-label="Loading petition">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6 motion-safe:animate-pulse">
            <div className="h-10 w-2/3 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-64 rounded-2xl bg-muted" />
          </div>
          <div className="h-96 rounded-2xl bg-muted motion-safe:animate-pulse" />
        </div>
      </main>
    )
  if (petitionQuery.isError || !petitionQuery.data)
    return (
      <main className="app-page">
        <section className="app-empty-state">
          <h1 className="font-display text-4xl">
            {petitionQuery.isError
              ? "This petition couldn't load."
              : "We couldn't find that petition."}
          </h1>
          <p className="mt-3 mb-6 text-sm text-muted-foreground">
            {petitionQuery.isError
              ? "Try again in a moment."
              : "It may have been removed, or the link may be incomplete."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {petitionQuery.isError ? (
              <Button onClick={() => petitionQuery.refetch()}>Try again</Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to={user ? ROUTES.petitions : ROUTES.home}>
                {user ? "Browse petitions" : "Home"}
              </Link>
            </Button>
          </div>
        </section>
      </main>
    )
  return <PetitionContent key={petitionQuery.data.id} petition={petitionQuery.data} />
}

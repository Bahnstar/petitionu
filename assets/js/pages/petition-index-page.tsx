import { AuthLink } from "../components/auth-link"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { buildCSRFHeaders, createComment, createSignature, getPetitions, type GetPetitionsFields } from "../ash_rpc"
import { PetitionOwnerControls } from "../features/petition/petition-owner-controls"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"

async function loadPetition(id: string | undefined) {
  const result = await getPetitions({
    fields: ["id", "title", "description", "status", "classroomId", "organizationId", "hasSigned", "canManage", "goal", "signaturesCount", "daysLeft", "trending", "author", "allowComments", "isAnonymous", "deadline", "insertedAt", { category: ["id", "name"] }, { comments: ["id", "text", "insertedAt", "author"] }, { signatures: ["id", "reason", "insertedAt"] }, { updates: ["id", "title", "body", "insertedAt"] }] as const satisfies GetPetitionsFields,
    filter: { id: { eq: id } },
    headers: buildCSRFHeaders(),
  })
  if (result.success === false) throw new Error("This petition couldn't be loaded. Please try again.")
  return result.data[0] ?? null
}

type Petition = NonNullable<Awaited<ReturnType<typeof loadPetition>>>

function PetitionContent({ petition }: { petition: Petition }) {
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState("")
  const [signatureReason, setSignatureReason] = useState("")
  const [shareMessage, setShareMessage] = useState("")
  const [sharePending, setSharePending] = useState(false)
  const invalidatePetition = () => {
    void queryClient.invalidateQueries({ queryKey: ["petition", petition.id] })
    void queryClient.invalidateQueries({ queryKey: ["petitions"] })
    void queryClient.invalidateQueries({ queryKey: ["dashboardUser"] })
    if (petition.classroomId) void queryClient.invalidateQueries({ queryKey: ["classroomPetitions", petition.classroomId] })
  }
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user?.emailVerified || !user.profileComplete) throw new Error("Complete your profile before commenting.")
      const result = await createComment({ input: { text, petitionId: petition.id }, headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error(result.errors[0]?.message || "Your comment couldn't be posted. Please try again.")
      return result.data
    },
    onSuccess: () => { setCommentText(""); invalidatePetition() },
  })
  const signatureMutation = useMutation({
    mutationFn: async () => {
      if (!user?.emailVerified || !user.profileComplete) throw new Error("Complete your profile before signing.")
      const result = await createSignature({ input: { petitionId: petition.id, reason: signatureReason.trim() || null }, fields: ["id"], headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error(result.errors[0]?.message || "Your signature couldn't be added. Please try again.")
      return result.data
    },
    onSuccess: () => { setSignatureReason(""); invalidatePetition() },
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
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage("Copy the link from your browser's address bar to share this petition.")
    } finally {
      setSharePending(false)
    }
  }
  const signatures = petition.signatures ?? []
  const comments = petition.comments ?? []
  const updates = petition.updates ?? []
  const signatureCount = petition.signaturesCount ?? 0
  const goal = petition.goal ?? 0
  const progress = goal > 0 ? Math.min(100, Math.max(0, signatureCount / goal * 100)) : 0
  const daysLeft = petition.deadline ? Math.max(0, Math.ceil((new Date(petition.deadline).getTime() - Date.now()) / 86_400_000)) : null
  const closed = petition.status !== "open" || !!(petition.deadline && new Date(petition.deadline) <= new Date())
  const canParticipate = !!(user?.emailVerified && user.profileComplete)
  const signed = signatureMutation.isSuccess || petition.hasSigned

  return (
    <main id="petition-detail-page" className="app-page">
      <Link to={ROUTES.petitions} className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><span className="hero-arrow-left size-4" aria-hidden="true" />Browse petitions</Link>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <article className="min-w-0 space-y-9">
          <header>
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1.5">{petition.category?.name ?? "General"}</span>
              {petition.status === "victory" ? <span className="rounded-full bg-[#f5cfdc] px-3 py-1.5 text-[#663e51]">Victory</span> : closed ? <span className="rounded-full border border-border px-3 py-1.5">Closed</span> : petition.trending ? <span className="rounded-full bg-[#f7e8d2] px-3 py-1.5 text-[#685649]">Gathering support</span> : null}
            </div>
            <h1 className="app-page-heading break-words">{petition.title}</h1>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-6 text-muted-foreground">
              <span>Started by {petition.isAnonymous ? "Anonymous" : petition.author || "a campus community member"}</span>
              {petition.insertedAt ? <span>{new Date(petition.insertedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span> : null}
            </div>
          </header>
          {petition.canManage ? <PetitionOwnerControls petition={petition} canPublishUpdate={canParticipate} /> : null}
          <section aria-labelledby="petition-story-heading" className="border-y border-border py-8">
            <h2 id="petition-story-heading" className="mb-4 font-display text-3xl tracking-tight">The change we're asking for.</h2>
            <p className="whitespace-pre-wrap break-words text-sm leading-8 text-muted-foreground">{petition.description}</p>
          </section>
          {updates.length > 0 ? <section aria-labelledby="petition-updates-heading">
            <h2 id="petition-updates-heading" className="mb-5 font-display text-3xl tracking-tight">Along the way.</h2>
            <div className="space-y-4">{updates.map((update) => <div key={update.id} className="app-panel">
              {update.insertedAt ? <p className="mb-2 text-xs text-muted-foreground">{new Date(update.insertedAt).toLocaleDateString()}</p> : null}
              <h3 className="mb-2 font-medium">{update.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{update.body}</p>
            </div>)}</div>
          </section> : null}
          <section aria-labelledby="petition-supporters-heading">
            <h2 id="petition-supporters-heading" className="mb-5 font-display text-3xl tracking-tight">Voices behind the idea.</h2>
            {signatures.length > 0 ? <div className="divide-y divide-border">{[...signatures].sort((a, b) => (b.insertedAt ?? "").localeCompare(a.insertedAt ?? "")).slice(0, 5).map((signature) => <div key={signature.id} className="py-5 first:pt-0">
              <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-medium">A campus supporter</span>{signature.insertedAt ? <span className="text-muted-foreground">{new Date(signature.insertedAt).toLocaleDateString()}</span> : null}</div>
              {signature.reason ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">“{signature.reason}”</p> : null}
            </div>)}</div> : <p className="text-sm leading-7 text-muted-foreground">{closed ? "This petition closed without signatures." : "Be the first to stand behind this idea."}</p>}
          </section>
          <section id="petition-comments" aria-labelledby="petition-comments-heading">
            <h2 id="petition-comments-heading" className="mb-5 font-display text-3xl tracking-tight">The conversation <span className="font-sans text-sm text-muted-foreground">({comments.length})</span></h2>
            {petition.allowComments ? closed ? <p className="mb-6 text-sm text-muted-foreground">This petition is no longer accepting comments.</p> : user ? !canParticipate ? <p className="mb-6 text-sm text-muted-foreground">Confirm your email and <Link to="/ash-typescript/profile" className="font-medium underline underline-offset-4">complete your profile</Link> to comment.</p> : <form id="petition-comment-form" onSubmit={(event) => { event.preventDefault(); if (commentText.trim() && !commentMutation.isPending) commentMutation.mutate(commentText.trim()) }} className="app-panel mb-6 space-y-4">
              <Label htmlFor="petition-comment">Add to the conversation</Label>
              <Textarea id="petition-comment" placeholder="Share a thought, a question, or why this matters to you." rows={4} value={commentText} onChange={(event) => setCommentText(event.target.value)} required className="resize-y" />
              {commentMutation.isError ? <p role="alert" className="text-sm text-destructive">{commentMutation.error.message}</p> : null}
              {commentMutation.isSuccess ? <p role="status" className="text-sm text-muted-foreground">Your comment has been posted.</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Keep it respectful and constructive.</p><Button id="post-comment" type="submit" disabled={!commentText.trim() || commentMutation.isPending}>{commentMutation.isPending ? "Posting…" : "Post comment"}</Button></div>
            </form> : <p className="mb-6 text-sm text-muted-foreground"><AuthLink className="font-medium text-primary underline underline-offset-4">Sign in</AuthLink> to join the conversation.</p> : <p className="mb-6 text-sm text-muted-foreground">Comments are turned off for this petition.</p>}
            <div className="divide-y divide-border">{comments.map((comment) => <div key={comment.id} className="py-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-medium">{comment.author || "A campus community member"}</span>{comment.insertedAt ? <span className="text-muted-foreground">{new Date(comment.insertedAt).toLocaleDateString()}</span> : null}</div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{comment.text}</p>
            </div>)}</div>
          </section>
        </article>
        <aside className="lg:sticky lg:top-8">
          <section id="petition-signature-panel" className="app-panel">
            <h2 className="mb-5 font-display text-3xl tracking-tight">{signed ? "You're part of this." : closed ? "A shared idea." : "Add your voice."}</h2>
            <p className="text-sm text-muted-foreground"><strong className="mr-2 font-display text-5xl font-normal tracking-tight text-foreground">{signatureCount.toLocaleString()}</strong> signatures</p>
            <div role={goal > 0 ? "progressbar" : undefined} aria-label={goal > 0 ? "Signature goal" : undefined} aria-valuenow={goal > 0 ? Math.round(progress) : undefined} aria-valuemin={goal > 0 ? 0 : undefined} aria-valuemax={goal > 0 ? 100 : undefined} className="mb-3 mt-5 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
            <p className="text-xs text-muted-foreground">{goal > 0 ? `of ${goal.toLocaleString()} signatures` : "Every voice counts"}{petition.deadline && !closed ? ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : ""}</p>
            <div className="mt-6 border-t border-border pt-6">
              {signed ? <div role="status" className="text-sm leading-7"><span className="hero-check-circle mr-2 size-5 align-middle text-primary" aria-hidden="true" />Your signature is counted. Help this idea reach more people by sharing it.</div> : closed ? <p className="text-sm leading-7 text-muted-foreground">{petition.status === "victory" ? "This petition has been marked as a victory. Thank you to everyone who spoke up." : "This petition is no longer accepting signatures."}</p> : authLoading ? <p role="status" className="text-sm text-muted-foreground">Loading your account…</p> : user ? !canParticipate ? <p className="text-sm leading-7 text-muted-foreground">Confirm your email and <Link to="/ash-typescript/profile" className="font-medium underline underline-offset-4">complete your profile</Link> to sign this petition.</p> : <form id="sign-petition-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!signatureMutation.isPending) signatureMutation.mutate() }}>
                <p className="text-sm text-muted-foreground">Signing as <span className="font-medium text-foreground">{user.firstName || user.email}</span></p>
                <Label htmlFor="signature-reason">Why are you signing? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="signature-reason" rows={3} value={signatureReason} onChange={(event) => setSignatureReason(event.target.value)} placeholder="Tell your community why this matters." />
                {signatureMutation.isError ? <p role="alert" className="text-sm text-destructive">{signatureMutation.error.message}</p> : null}
                <Button id="sign-petition" type="submit" className="w-full" disabled={signatureMutation.isPending}>{signatureMutation.isPending ? "Adding your signature…" : "Sign this petition"}</Button>
                <p className="text-xs leading-6 text-muted-foreground">Your reason for signing will appear on this petition.</p>
              </form> : <div className="space-y-4"><p className="text-sm leading-7 text-muted-foreground">Sign in to stand behind this idea and add your signature.</p><Button className="w-full" asChild><AuthLink>Sign in to support</AuthLink></Button></div>}
            </div>
          </section>
          <Button id="share-petition" variant="outline" className="mt-4 w-full" disabled={sharePending} onClick={sharePetition}><span className="hero-arrow-up-tray size-4" aria-hidden="true" />Share this petition</Button>
          {shareMessage ? <p role="status" className="mt-3 text-center text-xs leading-6 text-muted-foreground">{shareMessage}</p> : null}
          <p className="px-5 pt-6 text-center font-display text-2xl leading-tight text-muted-foreground">One idea. A little support.<br />A place to begin.</p>
        </aside>
      </div>
    </main>
  )
}

export default function PetitionIndexPage() {
  const { id } = useParams()
  const petitionQuery = useQuery({
    queryKey: ["petition", id],
    queryFn: () => loadPetition(id),
  })
  useDocumentTitle(petitionQuery.data?.title ?? "Petition")
  if (petitionQuery.isPending) return <main className="app-page" role="status" aria-label="Loading petition"><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-6 motion-safe:animate-pulse"><div className="h-10 w-2/3 rounded bg-muted" /><div className="h-20 rounded bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div><div className="h-96 rounded-2xl bg-muted motion-safe:animate-pulse" /></div></main>
  if (petitionQuery.isError || !petitionQuery.data) return <main className="app-page"><section className="app-empty-state"><h1 className="font-display text-4xl">{petitionQuery.isError ? "This petition couldn't load." : "We couldn't find that petition."}</h1><p className="mb-6 mt-3 text-sm text-muted-foreground">{petitionQuery.isError ? "Try again in a moment, or explore other campus ideas." : "It may have been removed, or the link may be incomplete."}</p><div className="flex flex-wrap justify-center gap-3">{petitionQuery.isError ? <Button onClick={() => petitionQuery.refetch()}>Try again</Button> : null}<Button variant="outline" asChild><Link to={ROUTES.petitions}>Browse petitions</Link></Button></div></section></main>
  return <PetitionContent key={petitionQuery.data.id} petition={petitionQuery.data} />
}

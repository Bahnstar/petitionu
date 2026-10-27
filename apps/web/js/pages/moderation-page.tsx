import { ROUTES } from "@/lib/routes"
import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  buildCSRFHeaders,
  getContentReports,
  getSupportRequests,
  resolveContentReport,
  resolveSupportRequest,
  type ResolveContentReportInput,
} from "../ash_rpc"
import { useAuth } from "../contexts/auth-context"
import { useDocumentTitle } from "../hooks/use-document-title"

function ReportResolution({ id, onResolved }: { id: string; onResolved: () => void }) {
  const [outcome, setOutcome] = useState<ResolveContentReportInput["outcome"]>("resolved")
  const [hideContent, setHideContent] = useState(false)
  const [resolutionNote, setResolutionNote] = useState("")
  const resolve = useMutation({
    mutationFn: async () => {
      const result = await resolveContentReport({
        identity: id,
        input: { outcome, hideContent: outcome === "resolved" && hideContent, resolutionNote },
        fields: ["id"],
        headers: buildCSRFHeaders(),
      })
      if (result.success === false)
        throw new Error(result.errors.map((error) => error.message).join(" "))
      return result.data
    },
    onSuccess: onResolved,
  })
  return (
    <form
      className="space-y-4 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        resolve.mutate()
      }}
    >
      <fieldset disabled={resolve.isPending} className="space-y-4">
        <legend className="sr-only">Resolve report</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`outcome-${id}`}
              checked={outcome === "resolved"}
              onChange={() => setOutcome("resolved")}
            />
            Resolve
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`outcome-${id}`}
              checked={outcome === "dismissed"}
              onChange={() => {
                setOutcome("dismissed")
                setHideContent(false)
              }}
            />
            Dismiss
          </label>
        </div>
        {outcome === "resolved" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={hideContent}
              onChange={(event) => setHideContent(event.target.checked)}
            />
            <span>
              Hide reported content. Hiding a petition also blocks its comments, signatures,
              updates, and further participation.
            </span>
          </label>
        )}
        <Label htmlFor={`report-note-${id}`}>Decision note, visible to the reporter</Label>
        <Textarea
          id={`report-note-${id}`}
          required
          maxLength={5000}
          value={resolutionNote}
          onChange={(event) => setResolutionNote(event.target.value)}
        />
        {resolve.error && (
          <p role="alert" className="text-sm text-destructive">
            {resolve.error.message}
          </p>
        )}
        <Button type="submit" disabled={resolve.isPending || !resolutionNote.trim()}>
          {resolve.isPending ? "Saving…" : "Save decision"}
        </Button>
      </fieldset>
    </form>
  )
}

function SupportResolution({ id, onResolved }: { id: string; onResolved: () => void }) {
  const [resolutionNote, setResolutionNote] = useState("")
  const resolve = useMutation({
    mutationFn: async () => {
      const result = await resolveSupportRequest({
        identity: id,
        input: { resolutionNote },
        fields: ["id"],
        headers: buildCSRFHeaders(),
      })
      if (result.success === false)
        throw new Error(result.errors.map((error) => error.message).join(" "))
      return result.data
    },
    onSuccess: onResolved,
  })
  return (
    <form
      className="space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        resolve.mutate()
      }}
    >
      <Label htmlFor={`support-note-${id}`}>Resolution note, visible to the requester</Label>
      <Textarea
        id={`support-note-${id}`}
        required
        maxLength={5000}
        disabled={resolve.isPending}
        value={resolutionNote}
        onChange={(event) => setResolutionNote(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Record the action you took. Resolving a request does not delete an account or send an email.
      </p>
      {resolve.error && (
        <p role="alert" className="text-sm text-destructive">
          {resolve.error.message}
        </p>
      )}
      <Button type="submit" disabled={resolve.isPending || !resolutionNote.trim()}>
        {resolve.isPending ? "Saving…" : "Resolve request"}
      </Button>
    </form>
  )
}

export default function ModerationPage() {
  function renderSupportRequests() {
    if (requests.isPending) {
      return <p role="status">Loading requests…</p>
    }
    if (requests.error) {
      return (
        <div>
          <p role="alert">{requests.error.message}</p>
          <Button variant="outline" onClick={() => requests.refetch()}>
            Retry
          </Button>
        </div>
      )
    }
    if (requests.data?.length === 0) {
      return (
        <p className="rounded-xl border p-8 text-muted-foreground">
          No {showReviewed ? "" : "open "}requests in your queue.
        </p>
      )
    }
    return requests.data?.map((request) => (
      <article key={request.id} className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">
            {request.kind === "account_deletion" ? "Account deletion request" : "Support request"}
          </h2>
          <span className="text-sm capitalize">{request.state}</span>
        </div>
        <a className="text-sm break-all underline" href={`mailto:${request.requesterEmail}`}>
          {request.requesterEmail}
        </a>
        <p className="break-words whitespace-pre-wrap">{request.message}</p>
        <p className="text-xs text-muted-foreground">
          Received {new Date(request.insertedAt).toLocaleString()}
        </p>
        {request.state === "open" ? (
          <SupportResolution id={request.id} onResolved={reviewed} />
        ) : (
          <p className="border-t pt-4 break-words whitespace-pre-wrap">
            Resolution: {request.resolutionNote}
          </p>
        )}
      </article>
    ))
  }

  function renderReports() {
    if (reports.isPending) {
      return <p role="status">Loading reports…</p>
    }
    if (reports.error) {
      return (
        <div>
          <p role="alert">{reports.error.message}</p>
          <Button variant="outline" onClick={() => reports.refetch()}>
            Retry
          </Button>
        </div>
      )
    }
    if (reports.data?.length === 0) {
      return (
        <p className="rounded-xl border p-8 text-muted-foreground">
          No {showReviewed ? "" : "open "}reports in your queue.
        </p>
      )
    }
    return reports.data?.map((report) => (
      <article key={report.id} className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">{report.targetTitle}</h2>
          <span className="text-sm capitalize">{report.state}</span>
        </div>
        <p className="text-sm">
          {report.commentId ? "Comment" : "Petition"} reported for {report.reason}.{" "}
          <Link className="underline" to={ROUTES.petition(report.petitionId)}>
            Open petition
          </Link>
        </p>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Content when reported</summary>
          <blockquote className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted p-4 break-words whitespace-pre-wrap">
            {report.targetText}
          </blockquote>
        </details>
        {report.details && <p className="break-words whitespace-pre-wrap">{report.details}</p>}
        <p className="text-xs text-muted-foreground">
          Reported {new Date(report.insertedAt).toLocaleString()}
        </p>
        {report.state === "open" ? (
          <ReportResolution id={report.id} onResolved={reviewed} />
        ) : (
          <p className="border-t pt-4 break-words whitespace-pre-wrap">
            Decision: {report.resolutionNote}
          </p>
        )}
      </article>
    ))
  }

  useDocumentTitle("Moderation")
  const { user, isLoading } = useAuth()
  const client = useQueryClient()
  const [tab, setTab] = useState<"reports" | "support">("reports")
  const [showReviewed, setShowReviewed] = useState(false)
  const [notice, setNotice] = useState("")
  const isOperator = user?.role === "admin" || user?.role === "superadmin"
  const reports = useQuery({
    queryKey: ["moderationReports", user?.id, showReviewed],
    enabled: isOperator && tab === "reports",
    queryFn: async () => {
      const result = await getContentReports({
        fields: [
          "id",
          "petitionId",
          "commentId",
          "targetTitle",
          "targetText",
          "reason",
          "details",
          "state",
          "resolutionNote",
          "insertedAt",
          "resolvedAt",
        ],
        filter: showReviewed ? undefined : { state: { eq: "open" } },
        sort: "-insertedAt",
        headers: buildCSRFHeaders(),
      })
      if (result.success === false)
        throw new Error(result.errors.map((error) => error.message).join(" "))
      return result.data
    },
  })
  const requests = useQuery({
    queryKey: ["moderationSupport", user?.id, showReviewed],
    enabled: isOperator && tab === "support",
    queryFn: async () => {
      const result = await getSupportRequests({
        fields: [
          "id",
          "kind",
          "requesterEmail",
          "message",
          "state",
          "resolutionNote",
          "insertedAt",
          "resolvedAt",
        ],
        filter: showReviewed ? undefined : { state: { eq: "open" } },
        sort: "-insertedAt",
        headers: buildCSRFHeaders(),
      })
      if (result.success === false)
        throw new Error(result.errors.map((error) => error.message).join(" "))
      return result.data
    },
  })
  const reviewed = () => {
    setNotice("Decision saved.")
    void client.invalidateQueries({ queryKey: ["moderationReports"] })
    void client.invalidateQueries({ queryKey: ["moderationSupport"] })
    void client.invalidateQueries({ queryKey: ["supportRequests"] })
    void client.invalidateQueries({ queryKey: ["petitions"] })
  }

  if (isLoading)
    return (
      <main className="app-page">
        <p role="status">Loading your account…</p>
      </main>
    )
  if (!isOperator)
    return (
      <main className="app-page space-y-3">
        <h1 className="text-3xl font-semibold">Moderation</h1>
        <p>This queue is available to campus administrators and platform operators.</p>
        <Link to={ROUTES.support} className="underline">
          Contact support
        </Link>
      </main>
    )

  return (
    <main className="app-page max-w-4xl space-y-7">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Campus care</p>
        <h1 className="text-3xl font-semibold">Moderation & support</h1>
        <p className="text-muted-foreground">
          Review concerns, protect student privacy, and record the actions you take.
        </p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2" role="group" aria-label="Queue">
          <Button
            variant={tab === "reports" ? "default" : "outline"}
            aria-pressed={tab === "reports"}
            onClick={() => {
              setTab("reports")
              setNotice("")
            }}
          >
            Content reports
          </Button>
          <Button
            variant={tab === "support" ? "default" : "outline"}
            aria-pressed={tab === "support"}
            onClick={() => {
              setTab("support")
              setNotice("")
            }}
          >
            Support requests
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={(event) => setShowReviewed(event.target.checked)}
          />
          Include reviewed
        </label>
      </div>
      {notice && (
        <p role="status" className="rounded-xl bg-muted p-3">
          {notice}
        </p>
      )}
      {tab === "reports" ? (
        <section className="space-y-5" aria-label="Content reports">
          {renderReports()}
        </section>
      ) : (
        <section className="space-y-5" aria-label="Support requests">
          {renderSupportRequests()}
        </section>
      )}
    </main>
  )
}

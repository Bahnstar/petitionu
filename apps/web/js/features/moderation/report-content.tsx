import { useId, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Flag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ContentReportReason } from "@petitionu/domain"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuth } from "../../contexts/auth-context"

const reasons: { value: ContentReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "privacy", label: "Personal information" },
  { value: "other", label: "Other concern" },
]

export function ReportContent({
  petitionId,
  commentId,
  className,
}: {
  petitionId: string
  commentId?: string
  className?: string
}) {
  const { user } = useAuth()
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState<ContentReportReason>("spam")
  const [details, setDetails] = useState("")
  const report = useMutation({
    mutationFn: async () => {
      const result = await api.createContentReport({ petitionId, commentId, reason, details })
      if (result.success === false)
        throw new Error(result.errors.map((error) => error.message).join(" "))
      return result.data
    },
  })

  if (!user) return null
  if (report.isSuccess)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Report received. A moderator can review it.
      </p>
    )

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <Flag />
        Report {commentId ? "comment" : "petition"}
      </Button>
      {expanded && (
        <form
          id={id}
          className="w-full space-y-4 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            report.mutate()
          }}
        >
          <fieldset disabled={report.isPending} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">What is the concern?</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {reasons.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <Label htmlFor={`${id}-details`}>Details, optional</Label>
            <Textarea
              id={`${id}-details`}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={5000}
              placeholder="Explain what a moderator should review."
            />
            <p className="text-xs text-muted-foreground">
              Your report and a copy of the content are available to you and authorized moderators.
            </p>
            {report.error && (
              <p role="alert" className="text-sm text-destructive">
                {report.error.message}
              </p>
            )}
            <Button type="submit" disabled={report.isPending}>
              {report.isPending ? "Sending…" : "Submit report"}
            </Button>
          </fieldset>
        </form>
      )}
    </div>
  )
}

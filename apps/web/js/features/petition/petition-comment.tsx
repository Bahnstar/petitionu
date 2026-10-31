import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import type { PetitionDetailDto } from "@petitionu/domain"
import { Button } from "@/components/ui/button"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formErrors } from "@/lib/api-errors"
import { formatDate } from "@/lib/utils"
import { ReportContent } from "../moderation/report-content"
import { mutatePetition } from "./petition-mutations"

type Mode = "view" | "edit" | "delete"
type Comment = PetitionDetailDto["comments"][number]

/** One comment in the conversation. Its author can edit it in place or delete it. */
export function PetitionComment({
  petition,
  comment,
}: {
  petition: { id: string; classroomId?: string | null }
  comment: Comment
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>("view")
  const [draft, setDraft] = useState(comment.text ?? "")
  const edit = useMutation({
    mutationFn: (text: string) =>
      mutatePetition(queryClient, { kind: "editComment", petition, commentId: comment.id, text }),
    onSuccess: () => setMode("view"),
  })
  // A deleted comment leaves the refreshed list, which unmounts this one.
  const remove = useMutation({
    mutationFn: () =>
      mutatePetition(queryClient, { kind: "deleteComment", petition, commentId: comment.id }),
  })
  const editId = `comment-${comment.id}-edit`
  const editErrors = formErrors(edit.error, ["text"])

  function open(next: Mode) {
    edit.reset()
    remove.reset()
    setDraft(comment.text ?? "")
    setMode(next)
  }

  function renderBody() {
    if (mode !== "edit") {
      return <p className="text-sm leading-7 break-words whitespace-pre-wrap">{comment.text}</p>
    }
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.trim() && !edit.isPending) edit.mutate(draft.trim())
        }}
      >
        <Label htmlFor={editId} className="sr-only">
          Edit your comment
        </Label>
        <Textarea
          id={editId}
          rows={3}
          maxLength={5000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={edit.isPending}
          {...fieldErrorProps(`${editId}-error`, editErrors.fields.text)}
        />
        <FieldError id={`${editId}-error`} message={editErrors.fields.text} />
        {editErrors.summary ? (
          <p role="alert" className="text-sm text-destructive">
            {editErrors.summary}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={!draft.trim() || edit.isPending}>
            {edit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {edit.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={edit.isPending}
            onClick={() => setMode("view")}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  function renderOwnerActions() {
    if (!comment.canEdit || mode === "edit") return null
    if (mode === "delete") {
      return (
        <div role="group" aria-label="Delete comment" className="mt-2 space-y-2">
          <p className="text-sm">Delete this comment? This can’t be undone.</p>
          {remove.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {remove.isPending ? "Deleting…" : "Delete comment"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => setMode("view")}
            >
              Keep it
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => open("edit")}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => open("delete")}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{comment.author || "A campus community member"}</span>
        {comment.insertedAt ? (
          <span className="text-muted-foreground">{formatDate(comment.insertedAt)}</span>
        ) : null}
      </div>
      {renderBody()}
      {renderOwnerActions()}
      {comment.canEdit ? null : <ReportContent petitionId={petition.id} commentId={comment.id} />}
    </div>
  )
}

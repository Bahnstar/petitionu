import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Reply, Trash2 } from "lucide-react"
import type { PetitionDetailDto } from "@petitionu/domain"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/utils"
import { ReportContent } from "../moderation/report-content"
import { PetitionCommentForm } from "./petition-comment-form"
import { mutatePetition } from "./petition-mutations"

type Mode = "view" | "edit" | "delete" | "reply"
type Comment = PetitionDetailDto["comments"][number]
type PetitionTarget = { id: string; classroomId?: string | null }

/**
 * Comments grouped under their top-level comment, oldest first. Replies arrive with the id of a
 * parent that may be hidden or deleted; that parent is simply missing from the list, so `comment`
 * is unset and its thread starts where its first reply does.
 */
function toThreads(comments: readonly Comment[]) {
  const threads = new Map<string, { id: string; comment?: Comment; replies: Comment[] }>()
  for (const comment of comments) {
    const id = comment.parentCommentId ?? comment.id
    const thread = threads.get(id) ?? { id, replies: [] }
    threads.set(id, thread)
    if (comment.parentCommentId) thread.replies.push(comment)
    else thread.comment = comment
  }
  return [...threads.values()]
}

/** The conversation: each top-level comment with its replies flat beneath it. */
export function PetitionThreads({
  petition,
  comments,
  canReply,
}: {
  petition: PetitionTarget
  comments: readonly Comment[]
  canReply: boolean
}) {
  const renderComment = (comment: Comment) => (
    <PetitionComment key={comment.id} petition={petition} comment={comment} canReply={canReply} />
  )
  return (
    <div className="petition-thread">
      {toThreads(comments).map((thread) => (
        <div key={thread.id}>
          {thread.comment ? (
            renderComment(thread.comment)
          ) : (
            <p className="text-sm text-muted-foreground italic">
              This comment is no longer available.
            </p>
          )}
          {thread.replies.length > 0 ? (
            <div className="petition-replies">{thread.replies.map(renderComment)}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * One comment or reply in the conversation. Its author can edit it in place or delete it, and
 * anyone who can comment can reply to it.
 */
function PetitionComment({
  petition,
  comment,
  canReply,
}: {
  petition: PetitionTarget
  comment: Comment
  canReply: boolean
}) {
  const queryClient = useQueryClient()
  const replyButton = useRef<HTMLButtonElement>(null)
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
  const authorName = comment.author || "A campus community member"

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
        />
        {edit.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {edit.error.message}
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

  function closeReply() {
    setMode("view")
    replyButton.current?.focus()
  }

  function renderActions() {
    if (mode === "edit") return null
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
      <div className="flex flex-wrap items-center gap-1">
        {canReply ? (
          <Button
            ref={replyButton}
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={mode === "reply"}
            onClick={() => (mode === "reply" ? closeReply() : open("reply"))}
          >
            <Reply aria-hidden="true" />
            Reply
          </Button>
        ) : null}
        {comment.canEdit && mode === "view" ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => open("edit")}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => open("delete")}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </>
        ) : null}
        {comment.canEdit ? null : (
          <ReportContent petitionId={petition.id} commentId={comment.id} className="contents" />
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{authorName}</span>
        {comment.insertedAt ? (
          <span className="text-muted-foreground">{formatDate(comment.insertedAt)}</span>
        ) : null}
      </div>
      {renderBody()}
      {renderActions()}
      {mode === "reply" ? (
        <PetitionCommentForm
          petition={petition}
          reply={{ commentId: comment.id, author: authorName, onClose: closeReply }}
        />
      ) : null}
    </div>
  )
}

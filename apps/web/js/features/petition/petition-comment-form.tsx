import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "../../contexts/auth-context"
import { mutatePetition, ReplyParentGone, replyMutationKey } from "./petition-mutations"

/**
 * Writes to a petition's conversation: a new comment, or with `reply` an inline reply to one.
 * A reply form takes focus when it opens and calls `onClose` when posted or cancelled. The text
 * can't change during a post, because a successful post clears it. If the comment it answers is
 * gone, the form goes with it, so `onParentGone` gets the text to keep. When the petition stops
 * `accepting` replies the form stays, read-only, so the text isn't lost with it.
 */
export function PetitionCommentForm({
  petition,
  reply,
}: {
  petition: { id: string; classroomId?: string | null }
  reply?: {
    commentId: string
    author: string
    accepting: boolean
    onClose: () => void
    onParentGone: (text: string) => void
  }
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const textarea = useRef<HTMLTextAreaElement>(null)
  const isReply = !!reply
  const mutation = useMutation({
    mutationKey: reply ? replyMutationKey(reply.commentId) : undefined,
    mutationFn: async (posted: string) => {
      if (!user?.emailVerified || !user.profileComplete)
        throw new Error("Complete your profile before commenting.")
      return mutatePetition(
        queryClient,
        reply
          ? { kind: "reply", petition, commentId: reply.commentId, text: posted }
          : { kind: "comment", petition, text: posted },
      )
    },
    onSuccess: () => {
      setText("")
      reply?.onClose()
    },
    onError: (error, posted) => {
      if (error instanceof ReplyParentGone) reply?.onParentGone(posted)
    },
  })
  const stopped = reply?.accepting === false
  const fieldId = reply ? `comment-${reply.commentId}-reply` : "petition-comment"

  useEffect(() => {
    if (isReply) textarea.current?.focus()
  }, [isReply])

  return (
    <form
      id={reply ? undefined : "petition-comment-form"}
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim() && !mutation.isPending && !stopped) mutation.mutate(text.trim())
      }}
      className={reply ? "mt-3 space-y-3" : "app-panel mb-6 space-y-4"}
    >
      <Label htmlFor={fieldId}>
        {reply ? `Reply to ${reply.author}` : "Add to the conversation"}
      </Label>
      <Textarea
        ref={textarea}
        id={fieldId}
        placeholder={
          reply ? "Add your reply." : "Share a thought, a question, or why this matters to you."
        }
        rows={reply ? 3 : 4}
        maxLength={5000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        readOnly={mutation.isPending || stopped}
        required
        className="resize-y"
      />
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
      {stopped ? (
        <p role="status" className="text-sm text-muted-foreground">
          This petition is no longer accepting replies.
        </p>
      ) : null}
      {!reply && mutation.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          Your comment has been posted.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Keep it respectful and constructive.</p>
        {reply ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={reply.onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || mutation.isPending || stopped}
            >
              {mutation.isPending ? "Posting…" : "Post reply"}
            </Button>
          </div>
        ) : (
          <Button id="post-comment" type="submit" disabled={!text.trim() || mutation.isPending}>
            {mutation.isPending ? "Posting…" : "Post comment"}
          </Button>
        )}
      </div>
    </form>
  )
}

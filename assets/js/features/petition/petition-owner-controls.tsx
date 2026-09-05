import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Megaphone, LockKeyhole, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { buildCSRFHeaders, updatePetition, createUpdate, closePetition, markPetitionVictory, type PetitionResourceSchema } from "../../ash_rpc"
import type { CleanResource } from "@/lib/types"

type Petition = Pick<CleanResource<PetitionResourceSchema>, "id" | "title" | "description" | "goal" | "deadline" | "allowComments" | "isAnonymous" | "status" | "classroomId">
type Mode = "idle" | "edit" | "update" | "close" | "victory"
type Command =
  | { kind: "edit"; input: Parameters<typeof updatePetition>[0]["input"] }
  | { kind: "update"; input: Parameters<typeof createUpdate>[0]["input"] }
  | { kind: "close" | "victory" }

function localDeadline(value: Petition["deadline"]) {
  if (!value) return ""
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function PetitionOwnerControls({ petition, canPublishUpdate }: { petition: Petition; canPublishUpdate: boolean }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>("idle")
  const [edit, setEdit] = useState(() => ({ title: petition.title ?? "", description: petition.description ?? "", goal: String(petition.goal ?? 100), deadline: localDeadline(petition.deadline), allowComments: !!petition.allowComments, isAnonymous: !!petition.isAnonymous }))
  const [update, setUpdate] = useState({ title: "", body: "" })
  const [success, setSuccess] = useState("")
  const mutation = useMutation({
    mutationFn: async (command: Command) => {
      const shared = { identity: petition.id, fields: ["id"] satisfies ["id"], headers: buildCSRFHeaders() }
      const result = command.kind === "edit" ? await updatePetition({ ...shared, input: command.input })
        : command.kind === "update" ? await createUpdate({ input: command.input, fields: ["id"], headers: buildCSRFHeaders() })
        : command.kind === "close" ? await closePetition(shared)
        : await markPetitionVictory(shared)
      if (result.success === false) throw new Error(result.errors.map((error) => error.message).join(" ") || "Your change couldn't be saved. Please try again.")
      return command.kind
    },
    onSuccess: async (kind) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["petition", petition.id] }),
        queryClient.invalidateQueries({ queryKey: ["petitions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboardUser"] }),
        ...(petition.classroomId ? [queryClient.invalidateQueries({ queryKey: ["classroomPetitions", petition.classroomId] })] : []),
      ])
      setMode("idle")
      if (kind === "update") setUpdate({ title: "", body: "" })
      setSuccess(kind === "edit" ? "Your petition has been updated." : kind === "update" ? "Your update has been published." : kind === "close" ? "Your petition is closed." : "Your petition has been marked as a victory.")
    },
  })
  const open = (next: Mode) => {
    mutation.reset()
    setSuccess("")
    if (next === "edit") setEdit({ title: petition.title ?? "", description: petition.description ?? "", goal: String(petition.goal ?? 100), deadline: localDeadline(petition.deadline), allowComments: !!petition.allowComments, isAnonymous: !!petition.isAnonymous })
    setMode(next)
  }

  return <section id="petition-owner-controls" className="app-panel space-y-5" aria-labelledby="manage-petition-heading">
    <div><h2 id="manage-petition-heading" className="font-display text-3xl tracking-tight">Manage your petition</h2><p className="mt-2 text-sm text-muted-foreground">Keep your community informed as your idea moves forward.</p></div>
    {!canPublishUpdate ? <p className="text-sm text-muted-foreground">Confirm your email and <Link to="/ash-typescript/profile" className="underline underline-offset-4">complete your profile</Link> to post updates.</p> : null}
    {success ? <p role="status" className="text-sm text-primary">{success}</p> : null}
    {mode === "idle" ? <div className="flex flex-wrap gap-3">
      <Button id="edit-petition" variant="outline" onClick={() => open("edit")}><Pencil aria-hidden="true" />Edit petition</Button>
      <Button id="add-petition-update" disabled={!canPublishUpdate} variant="outline" onClick={() => open("update")}><Megaphone aria-hidden="true" />Post an update</Button>
      {petition.status === "open" ? <Button id="close-petition" variant="outline" onClick={() => open("close")}><LockKeyhole aria-hidden="true" />Close petition</Button> : null}
      {petition.status !== "victory" ? <Button id="mark-petition-victory" variant="outline" onClick={() => open("victory")}><Trophy aria-hidden="true" />Mark as victory</Button> : null}
    </div> : <form id={`petition-owner-${mode}-form`} onSubmit={(event) => {
      event.preventDefault()
      if (mutation.isPending) return
      if (mode === "edit") mutation.mutate({ kind: "edit", input: { title: edit.title.trim(), description: edit.description.trim(), goal: Number(edit.goal), deadline: edit.deadline ? new Date(edit.deadline).toISOString() : null, allowComments: edit.allowComments, isAnonymous: edit.isAnonymous } })
      else if (mode === "update") {
        if (!canPublishUpdate) return
        mutation.mutate({ kind: "update", input: { petitionId: petition.id, title: update.title.trim(), body: update.body.trim() } })
      } else mutation.mutate({ kind: mode })
    }}>
      <fieldset disabled={mutation.isPending} className="space-y-5">
        <legend className="sr-only">{mode === "edit" ? "Edit petition" : mode === "update" ? "Post an update" : mode === "close" ? "Confirm closure" : "Confirm victory"}</legend>
        {mode === "edit" ? <>
          <div className="space-y-2"><Label htmlFor="edit-petition-title">Petition title</Label><Input id="edit-petition-title" value={edit.title} required maxLength={100} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="edit-petition-description">Petition description</Label><Textarea id="edit-petition-description" rows={7} value={edit.description} required maxLength={2000} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="edit-petition-goal">Signature goal</Label><Input id="edit-petition-goal" type="number" min={1} step={1} required value={edit.goal} onChange={(event) => setEdit({ ...edit, goal: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="edit-petition-deadline">Deadline (optional)</Label><Input id="edit-petition-deadline" type="datetime-local" value={edit.deadline} onChange={(event) => setEdit({ ...edit, deadline: event.target.value })} /><p className="text-xs text-muted-foreground">Your local timezone. Signing and comments close at this time.</p></div>
          <Label className="flex items-center gap-3"><input id="edit-petition-comments" type="checkbox" className="size-4 accent-primary" checked={edit.allowComments} onChange={(event) => setEdit({ ...edit, allowComments: event.target.checked })} />Allow comments</Label>
          <Label className="flex items-center gap-3"><input id="edit-petition-anonymous" type="checkbox" className="size-4 accent-primary" checked={edit.isAnonymous} onChange={(event) => setEdit({ ...edit, isAnonymous: event.target.checked })} />Hide my name as the petition creator</Label>
          <p className="text-xs leading-6 text-muted-foreground">Hiding your name changes the creator label to “Anonymous.” It does not hide your name on comments. People may already have seen or shared your name.</p>
        </> : mode === "update" ? <>
          <div className="space-y-2"><Label htmlFor="petition-update-title">Update title</Label><Input id="petition-update-title" value={update.title} required onChange={(event) => setUpdate({ ...update, title: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="petition-update-body">What has changed?</Label><Textarea id="petition-update-body" value={update.body} rows={5} required onChange={(event) => setUpdate({ ...update, body: event.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Your update will appear on the petition for everyone who can view it.</p>
        </> : <p className="text-sm leading-7">{mode === "close" ? "Close this petition? It will remain visible, but people will no longer be able to sign or comment. You can still post updates. This cannot be undone here." : "Has your petition achieved its goal? Marking it as a victory celebrates the result and ends signing and comments. This cannot be undone here."}</p>}
        {mutation.isError ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}
        <div className="flex flex-wrap gap-3"><Button id={`confirm-petition-${mode}`} type="submit">{mutation.isPending ? "Saving…" : mode === "edit" ? "Save changes" : mode === "update" ? "Publish update" : mode === "close" ? "Confirm close petition" : "Confirm victory"}</Button><Button type="button" variant="outline" onClick={() => open("idle")}>Cancel</Button></div>
      </fieldset>
    </form>}
  </section>
}

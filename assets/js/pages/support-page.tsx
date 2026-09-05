import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { buildCSRFHeaders, createSupportRequest, getMySupportRequests, supportContact, type CreateSupportRequestInput } from "../ash_rpc"
import { useAuth } from "../contexts/auth-context"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function SupportPage() {
  useDocumentTitle("Support")
  const { user, isLoading } = useAuth()
  const client = useQueryClient()
  const [kind, setKind] = useState<CreateSupportRequestInput["kind"]>("support")
  const [message, setMessage] = useState("")
  const contact = useQuery({ queryKey: ["supportContact"], queryFn: async () => {
    const result = await supportContact({ headers: buildCSRFHeaders() })
    if (result.success === false) throw new Error("The support address could not be loaded. Try again.")
    return result.data
  } })
  const requests = useQuery({ queryKey: ["supportRequests", user?.id], enabled: !!user, queryFn: async () => {
    const result = await getMySupportRequests({ fields: ["id", "kind", "message", "state", "resolutionNote", "insertedAt"], sort: "-insertedAt", headers: buildCSRFHeaders() })
    if (result.success === false) throw new Error(result.errors.map(error => error.message).join(" "))
    return result.data
  } })
  const submit = useMutation({ mutationFn: async () => {
    const result = await createSupportRequest({ input: { kind, message }, fields: ["id"], headers: buildCSRFHeaders() })
    if (result.success === false) throw new Error(result.errors.map(error => error.message).join(" "))
    return result.data
  }, onSuccess: async () => { setMessage(""); await client.invalidateQueries({ queryKey: ["supportRequests"] }) } })

  return <main className="app-page max-w-3xl space-y-8">
    <header className="space-y-3"><p className="text-sm font-medium text-muted-foreground">Here to help</p><h1 className="text-3xl font-semibold">Support & account requests</h1><p className="text-muted-foreground">Ask about your campus, report an account problem, or request account deletion.</p></header>
    <section className="rounded-2xl border bg-card p-6 space-y-3"><h2 className="text-lg font-semibold">Contact support</h2>{contact.isPending ? <p role="status">Loading contact details…</p> : contact.error ? <div><p role="alert">{contact.error.message}</p><Button variant="outline" onClick={() => contact.refetch()}>Retry</Button></div> : <p>Email <a className="underline" href={`mailto:${contact.data}`}>{contact.data}</a>. You can contact us without an account.</p>}</section>
    {isLoading ? <p role="status">Loading your account…</p> : !user ? <p><Link to="/sign-in" className="underline">Sign in</Link> to submit a request and track its status here.</p> : <>
      <form className="rounded-2xl border bg-card p-6 space-y-5" onSubmit={event => { event.preventDefault(); submit.mutate() }}>
        <h2 className="text-lg font-semibold">Submit a request</h2>
        <fieldset disabled={submit.isPending} className="space-y-4"><legend className="sr-only">Request type</legend>
          <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2"><input type="radio" name="request-kind" checked={kind === "support"} onChange={() => { setKind("support"); submit.reset() }} />Support</label><label className="flex items-center gap-2"><input type="radio" name="request-kind" checked={kind === "account_deletion"} onChange={() => { setKind("account_deletion"); submit.reset() }} />Account deletion</label></div>
          {kind === "account_deletion" && <p className="text-sm text-muted-foreground">Submitting this request does not delete your account or content. An operator will review it and record an update below. You can continue using your account while the request is open.</p>}
          <Label htmlFor="support-message">How can we help?</Label><Textarea id="support-message" required maxLength={5000} value={message} onChange={event => { setMessage(event.target.value); submit.reset() }} />
          <p className="text-xs text-muted-foreground">Your request and email address are shared with authorized operators. Do not include passwords.</p>
          {submit.error && <p role="alert" className="text-sm text-destructive">{submit.error.message}</p>}{submit.isSuccess && <p role="status">Request received. You can follow its status below.</p>}
          <Button type="submit" disabled={submit.isPending || !message.trim()}>{submit.isPending ? "Sending…" : "Submit request"}</Button>
        </fieldset>
      </form>
      <section className="space-y-4"><h2 className="text-xl font-semibold">Your requests</h2>{requests.isPending ? <p role="status">Loading requests…</p> : requests.error ? <div><p role="alert">{requests.error.message}</p><Button variant="outline" onClick={() => requests.refetch()}>Retry</Button></div> : requests.data?.length === 0 ? <p className="text-muted-foreground">You have no requests yet.</p> : requests.data?.map(request => <article key={request.id} className="rounded-xl border p-5 space-y-2"><div className="flex justify-between gap-3"><h3 className="font-medium">{request.kind === "account_deletion" ? "Account deletion" : "Support"}</h3><span className="text-sm capitalize">{request.state}</span></div><p className="whitespace-pre-wrap break-words">{request.message}</p>{request.resolutionNote && <p className="border-t pt-3 whitespace-pre-wrap break-words">Operator update: {request.resolutionNote}</p>}<p className="text-xs text-muted-foreground">{new Date(request.insertedAt).toLocaleString()}</p></article>)}</section>
    </>}
  </main>
}

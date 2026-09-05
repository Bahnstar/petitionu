import { readPetitionDraft, savePetitionDraft, clearPetitionDraft } from "../lib/petition-draft"
import { AuthLink } from "../components/auth-link"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildCSRFHeaders, createPetition, createClassroomPetition, getCategories, getClassroomById } from "../ash_rpc"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDocumentTitle } from "../hooks/use-document-title"
import { ROUTES } from "@/lib/routes"
import { useAuth } from "../contexts/auth-context"

export default function CreatePetitionPage() {
  const [searchParams] = useSearchParams()
  const classroomId = searchParams.get("classroomId")
  return <PetitionForm key={classroomId ?? "public"} classroomId={classroomId} />
}

function PetitionForm({ classroomId }: { classroomId: string | null }) {
  useDocumentTitle("Start a Petition")
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const returnPath = classroomId ? ROUTES.classroom(classroomId) : ROUTES.petitions
  const classroomQuery = useQuery({
    queryKey: ["classroomContext", classroomId],
    enabled: !!classroomId && !!user,
    queryFn: async () => {
      const result = await getClassroomById({ input: { id: classroomId! }, fields: ["id", "name"], headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error("This classroom could not be loaded. Return to the classroom and try again.")
      return result.data
    },
  })
  const [formData, setFormData] = useState(() => readPetitionDraft(classroomId))
  const [createdId, setCreatedId] = useState<string | null>(null)
  useEffect(() => {
    if (createdId) clearPetitionDraft(classroomId)
    else savePetitionDraft(classroomId, formData)
  }, [classroomId, formData, createdId])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const result = await getCategories({ fields: ["id", "name"], headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error("We couldn't load the categories. Please try again.")
      return result.data
    },
  })
  const handleChange = (field: keyof typeof formData, value: string) => setFormData((previous) => ({ ...previous, [field]: value }))
  const isFormValid = !!(formData.title.trim() && formData.description.trim() && formData.categoryId)
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting || !isFormValid || !user || (classroomId && !classroomQuery.isSuccess)) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const input = { title: formData.title.trim(), description: formData.description.trim(), status: "open" as const, goal: Number(formData.goal), categoryId: formData.categoryId }
      const result = classroomId
        ? await createClassroomPetition({ input: { ...input, classroomId }, fields: ["id"], headers: buildCSRFHeaders() })
        : await createPetition({ input, fields: ["id"], headers: buildCSRFHeaders() })
      if (result.success === false) {
        setSubmitError(result.errors.map((error) => error.message).join(" ") || "Your petition couldn't be created. Please try again.")
      } else {
        setCreatedId(result.data.id)
        void queryClient.invalidateQueries({ queryKey: ["petitions"] })
        void queryClient.invalidateQueries({ queryKey: ["dashboardUser"] })
        if (classroomId) {
          void queryClient.invalidateQueries({ queryKey: ["classroomPetitions", classroomId] })
          void queryClient.invalidateQueries({ queryKey: ["classroom", classroomId] })
          void queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
        }
        window.scrollTo({ top: 0 })
      }
    } catch {
      setSubmitError("Your petition couldn't be created. Check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (createdId) return (
    <main id="petition-created" className="app-page">
      <section className="app-empty-state mx-auto max-w-2xl" role="status">
        <span className="hero-check-circle mb-5 size-12 text-primary" aria-hidden="true" />
        <h1 className="app-page-heading">Your idea is out there.</h1>
        <p className="app-page-description mx-auto">Your petition is live. Share it with the people who care, and take the next step together.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Button id="view-created-petition" asChild><Link to={ROUTES.petition(createdId)}>View your petition</Link></Button><Button variant="outline" asChild><Link to={ROUTES.petitions}>Browse petitions</Link></Button></div>
      </section>
    </main>
  )

  return (
    <main id="create-petition-page" className="app-page">
      <header className="mb-10 max-w-2xl">
        <Link to={returnPath} className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><span className="hero-arrow-left size-4" aria-hidden="true" />{classroomId ? "Back to classroom" : "Browse petitions"}</Link>
        <h1 className="app-page-heading">Let's start with your idea.</h1>
        <p className="app-page-description">A better campus begins with one clear ask. Tell your community what you'd change and why it matters.</p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <section className="app-panel order-2 lg:order-1" aria-labelledby="petition-details-heading">
          <h2 id="petition-details-heading" className="mb-2 font-display text-3xl tracking-tight">Put your idea into words.</h2>
          <p className="mb-8 text-sm text-muted-foreground">All fields are required. You can start with a small signature goal.</p>
          {classroomId ? <p id="petition-classroom-context" className="mb-6 rounded-xl bg-secondary p-4 text-sm">{classroomQuery.isSuccess ? `This petition will be shared with ${classroomQuery.data.name}.` : classroomQuery.isError ? classroomQuery.error.message : "Creating a classroom petition."}</p> : null}
          {!authLoading && !user ? <div className="mb-6 rounded-xl border border-border bg-secondary p-4 text-sm">Sign in to publish your petition. <AuthLink className="font-medium underline underline-offset-4">Sign in</AuthLink></div> : null}
          {categoryQuery.isError ? <div role="alert" className="mb-6 text-sm text-destructive">{categoryQuery.error.message} <button type="button" className="underline" onClick={() => categoryQuery.refetch()}>Try again</button></div> : null}
          {submitError ? <p id="petition-submit-error" role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{submitError}</p> : null}
          <form id="create-petition-form" onSubmit={handleSubmit} className="space-y-7">
            <div className="space-y-2">
              <Label htmlFor="title">What would you like to change?</Label>
              <Input id="title" placeholder="Keep the library open later during finals" value={formData.title} onChange={(event) => handleChange("title", event.target.value)} required maxLength={100} aria-describedby="title-help" />
              <p id="title-help" className="flex justify-between gap-3 text-xs text-muted-foreground"><span>Make your title a clear, specific ask.</span><span className="shrink-0">{formData.title.length}/100</span></p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={formData.categoryId} onValueChange={(value) => handleChange("categoryId", value)} required disabled={categoryQuery.isPending || categoryQuery.isError}>
                <SelectTrigger id="category" className="w-full"><SelectValue placeholder={categoryQuery.isPending ? "Loading categories…" : "Choose a category"} /></SelectTrigger>
                <SelectContent>{categoryQuery.data?.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
              </Select>
              {categoryQuery.isSuccess && categoryQuery.data.length === 0 ? <p className="text-xs text-muted-foreground">No categories are available yet. Please try again later.</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Why does it matter?</Label>
              <Textarea id="description" placeholder="Describe the issue, the change you're asking for, and who can help make it happen." value={formData.description} onChange={(event) => handleChange("description", event.target.value)} required rows={9} maxLength={2000} className="min-h-48 resize-y leading-7" aria-describedby="description-help" />
              <p id="description-help" className="flex justify-between gap-3 text-xs text-muted-foreground"><span>Help people understand why their support matters.</span><span className="shrink-0">{formData.description.length}/2,000</span></p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">Signature goal</Label>
              <Select value={formData.goal} onValueChange={(value) => handleChange("goal", value)}><SelectTrigger id="goal" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[100, 250, 500, 1000, 2500, 5000, 10000].map((goal) => <SelectItem key={goal} value={String(goal)}>{goal.toLocaleString()} signatures</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">Choose a goal that makes sense for your community.</p>
            </div>
            <p className="border-t border-border pt-5 text-xs leading-6 text-muted-foreground">Keep your petition respectful, inclusive, and focused on a change your campus can make.</p>
            <div className="flex flex-wrap gap-3">
              <Button id="publish-petition" type="submit" disabled={!isFormValid || isSubmitting || !user || !!(classroomId && !classroomQuery.isSuccess)} className="flex-1 sm:flex-none">{isSubmitting ? "Publishing…" : "Publish petition"}</Button>
              <Button type="button" variant="outline" asChild><Link to={returnPath}>Cancel</Link></Button>
            </div>
          </form>
        </section>
        <aside id="petition-writing-tips" className="order-1 rounded-2xl bg-[#f7e8d2] p-6 text-[#685649] lg:order-2 lg:p-7">
          <span className="hero-light-bulb mb-4 size-7" aria-hidden="true" />
          <h2 className="font-display text-3xl tracking-tight">A little clarity goes a long way.</h2>
          <ul className="mt-5 space-y-4 text-sm leading-6"><li>Ask for one specific change.</li><li>Share a personal story or a fact that makes the issue real.</li><li>Name the person or department who can help.</li><li>Write like you're talking to a classmate.</li></ul>
        </aside>
      </div>
    </main>
  )
}

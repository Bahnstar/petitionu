import { useAuth } from "../contexts/auth-context"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PetitionCard } from "../features/petition/petition-card"
import { buildCSRFHeaders, getCategories, getPetitions, PetitionResourceSchema } from "../ash_rpc"
import { CleanResource } from "../../lib/types"
import { useQuery } from "@tanstack/react-query"
import { useDocumentTitle } from "../hooks/use-document-title"
import { ROUTES } from "@/lib/routes"

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "most-signed", label: "Most signed" },
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending soon" },
]

type Petition = CleanResource<PetitionResourceSchema>

export default function BrowsePetitionsPage() {
  useDocumentTitle("Browse Petitions")
  const { user, isLoading: authLoading } = useAuth()
  const [campusScope, setCampusScope] = useState("mine")
  const organizationId = campusScope === "mine" ? user?.organizationId : null
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortBy, setSortBy] = useState("trending")
  const petitionsQuery = useQuery({
    queryKey: ["petitions", { organizationId: organizationId ?? null }],
    enabled: !authLoading,
    queryFn: async () => {
      const result = await getPetitions({
        fields: ["id", "title", "description", "status", "goal", "signaturesCount", "daysLeft", "trending", "author", "categoryId", "isAnonymous", "deadline", "insertedAt", { category: ["id", "name"] }],
        filter: organizationId ? { organizationId: { eq: organizationId } } : undefined,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) throw new Error("We couldn't load the petitions. Please try again.")
      return result.data as Petition[]
    },
  })
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const result = await getCategories({ fields: ["id", "name"], headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error("We couldn't load the categories.")
      return result.data
    },
  })

  const search = searchQuery.trim().toLowerCase()
  const petitions = petitionsQuery.data ?? []
  const filteredPetitions = petitions.filter((petition) => (
    (!search || `${petition.title ?? ""} ${petition.description ?? ""}`.toLowerCase().includes(search)) &&
    (selectedCategory === "all" || petition.categoryId === selectedCategory)
  )).sort((a, b) => {
    switch (sortBy) {
      case "most-signed": return (b.signaturesCount ?? 0) - (a.signaturesCount ?? 0)
      case "newest": return (b.insertedAt ?? "").localeCompare(a.insertedAt ?? "")
      case "ending-soon": {
        const now = Date.now()
        const deadline = (petition: Petition) => petition.status === "open" && petition.deadline && new Date(petition.deadline).getTime() > now ? new Date(petition.deadline).getTime() : Infinity
        return deadline(a) - deadline(b)
      }
      default: return Number(b.trending) - Number(a.trending) || (b.signaturesCount ?? 0) - (a.signaturesCount ?? 0)
    }
  })
  const hasFilters = searchQuery !== "" || selectedCategory !== "all"
  const clearFilters = () => { setSearchQuery(""); setSelectedCategory("all") }

  return (
    <main id="browse-petitions-page" className="app-page">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-9">
        <div className="max-w-2xl">
          <h1 className="app-page-heading">Find something worth<br className="hidden sm:block" /> speaking up about.</h1>
          <p className="app-page-description">Small asks. Shared ideas. Discover what your campus cares about, and add your voice.</p>
        </div>
        <Button id="browse-start-petition" asChild><Link to={ROUTES.createPetition}>Start a petition</Link></Button>
      </header>

      <section aria-label="Find petitions" className="mb-8 space-y-5">
        {user?.organizationId ? <div className="flex flex-wrap items-center gap-3"><div className="flex gap-2" aria-label="Campus scope"><Button id="my-campus" variant={campusScope === "mine" ? "default" : "outline"} aria-pressed={campusScope === "mine"} onClick={() => setCampusScope("mine")}>My campus</Button><Button id="all-campuses" variant={campusScope === "all" ? "default" : "outline"} aria-pressed={campusScope === "all"} onClick={() => setCampusScope("all")}>All campuses</Button></div><p className="text-sm text-muted-foreground">{campusScope === "mine" ? user.organization?.name : "Ideas from every campus"}</p></div> : user ? <p className="text-sm text-muted-foreground"><Link to="/ash-typescript/profile" className="underline underline-offset-4">Complete your profile</Link> to find your campus. Showing all campuses.</p> : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="hero-magnifying-glass pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="petition-search" type="search" aria-label="Search petitions" placeholder="Search ideas, issues, and petitions" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-12 rounded-full bg-white pl-12" />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger id="petition-sort" aria-label="Sort petitions" className="h-12 w-full rounded-full bg-white sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filter by category">
          <Button size="sm" variant={selectedCategory === "all" ? "default" : "outline"} aria-pressed={selectedCategory === "all"} onClick={() => setSelectedCategory("all")}>All petitions</Button>
          {categoryQuery.data?.map((category) => <Button key={category.id} size="sm" variant={selectedCategory === category.id ? "default" : "outline"} aria-pressed={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.name}</Button>)}
        </div>
        {categoryQuery.isError ? <p role="alert" className="text-sm text-muted-foreground">Categories are unavailable. You can still search petitions. <button className="underline underline-offset-4" onClick={() => categoryQuery.refetch()}>Try again</button></p> : null}
      </section>

      {petitionsQuery.isPending ? (
        <div role="status" aria-label="Loading petitions" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="app-panel min-h-80 space-y-6 motion-safe:animate-pulse"><div className="h-6 w-24 rounded-full bg-muted" /><div className="h-9 w-3/4 rounded bg-muted" /><div className="h-20 rounded bg-muted" /><div className="h-2 rounded bg-muted" /></div>)}
        </div>
      ) : petitionsQuery.isError ? (
        <div role="alert" className="app-empty-state"><h2 className="font-display text-3xl">Petitions couldn't load.</h2><p className="mb-6 mt-3 text-sm text-muted-foreground">Please try again in a moment.</p><Button onClick={() => petitionsQuery.refetch()}>Try again</Button></div>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p role="status" className="text-sm text-muted-foreground">{filteredPetitions.length} {filteredPetitions.length === 1 ? "petition" : "petitions"}{hasFilters ? " found" : " to explore"}</p>
            {hasFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
          </div>
          {filteredPetitions.length > 0 ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filteredPetitions.map((petition) => <PetitionCard key={petition.id} petition={petition} />)}</div> : (
            <div id="petitions-empty" className="app-empty-state">
              <span className="hero-chat-bubble-left-right mb-5 size-9 text-primary" aria-hidden="true" />
              <h2 className="font-display text-3xl">{hasFilters ? "No ideas found just yet." : "Your idea could be the first."}</h2>
              <p className="mb-6 mt-3 text-sm text-muted-foreground">{hasFilters ? "Try a different search or explore all petitions." : "Turn that thing you keep talking about into one clear ask."}</p>
              {hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Button asChild><Link to={ROUTES.createPetition}>Start a petition</Link></Button>}
            </div>
          )}
        </>
      )}
    </main>
  )
}

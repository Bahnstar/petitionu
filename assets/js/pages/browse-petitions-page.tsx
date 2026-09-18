import { AuthLink } from "../components/auth-link"
import { useAuth } from "../contexts/auth-context"
import { useCurrentTime } from "../hooks/use-current-time"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const PAGE_SIZE = 12

function PetitionSearch({
  query,
  navigationKey,
  onSearch,
}: {
  query: string
  navigationKey: string
  onSearch: (value: string) => void
}) {
  const [draft, setDraft] = useState(query)
  const [previousKey, setPreviousKey] = useState(navigationKey)
  if (previousKey !== navigationKey) {
    setPreviousKey(navigationKey)
    setDraft(query)
  }
  useEffect(() => {
    if (draft === query) return
    const timer = window.setTimeout(() => onSearch(draft), 300)
    return () => window.clearTimeout(timer)
  }, [draft, query, onSearch])
  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(draft)
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 left-4 hero-magnifying-glass size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id="petition-search"
        type="search"
        aria-label="Search petitions"
        placeholder="Search ideas, issues, and petitions"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-12 rounded-full bg-white pl-12"
      />
    </form>
  )
}

export default function BrowsePetitionsPage() {
  const { user, isLoading } = useAuth()
  if (isLoading)
    return (
      <main className="app-page" role="status">
        Loading your account…
      </main>
    )
  if (!user)
    return (
      <main className="app-page">
        <h1 className="app-page-heading">Sign in to browse petitions</h1>
        <AuthLink>Sign in</AuthLink>
      </main>
    )
  return <AuthenticatedBrowsePetitionsPage />
}

function AuthenticatedBrowsePetitionsPage() {
  function renderCampusScope() {
    if (user?.organizationId) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2" aria-label="Campus scope">
            <Button
              id="my-campus"
              variant={campusScope === "mine" ? "default" : "outline"}
              aria-pressed={campusScope === "mine"}
              onClick={() => setCampusScope("mine")}
            >
              My campus
            </Button>
            <Button
              id="all-campuses"
              variant={campusScope === "all" ? "default" : "outline"}
              aria-pressed={campusScope === "all"}
              onClick={() => setCampusScope("all")}
            >
              All campuses
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {campusScope === "mine" ? user.organization?.name : "Ideas from every campus"}
          </p>
        </div>
      )
    }
    if (user) {
      return (
        <p className="text-sm text-muted-foreground">
          <Link to="/ash-typescript/profile" className="underline underline-offset-4">
            Complete your profile
          </Link>{" "}
          to find your campus. Showing all campuses.
        </p>
      )
    }
    return null
  }

  const now = useCurrentTime()
  useDocumentTitle("Browse Petitions")
  const { user, isLoading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const campusScope = searchParams.get("campus") === "all" ? "all" : "mine"
  const searchQuery = searchParams.get("q") ?? ""
  const selectedCategory = searchParams.get("category") || "all"
  const requestedSort = searchParams.get("sort")
  const sortBy = SORT_OPTIONS.find((option) => option.value === requestedSort)?.value ?? "trending"
  const requestedPage = Number(searchParams.get("page"))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const updateFilter = useCallback(
    (name: string, value: string, replace = false) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (value) next.set(name, value)
          else next.delete(name)
          next.delete("page")
          return next
        },
        { replace },
      )
    },
    [setSearchParams],
  )
  const setCampusScope = (value: string) => updateFilter("campus", value)
  const setSelectedCategory = (value: string) => updateFilter("category", value)
  const setSortBy = (value: string) => updateFilter("sort", value)
  const setSearchQuery = useCallback(
    (value: string) => updateFilter("q", value, true),
    [updateFilter],
  )
  const organizationId = campusScope === "mine" ? user?.organizationId : null
  const petitionsQuery = useQuery({
    queryKey: ["petitions", "browse", { organizationId: organizationId ?? null }],
    enabled: !authLoading,
    staleTime: 60_000,
    queryFn: async () => {
      const result = await getPetitions({
        fields: [
          "id",
          "title",
          "description",
          "status",
          "goal",
          "signaturesCount",
          "trending",
          "author",
          "categoryId",
          "isAnonymous",
          "deadline",
          "insertedAt",
          { category: ["id", "name"] },
        ],
        sort: "-insertedAt",
        filter: organizationId ? { organizationId: { eq: organizationId } } : undefined,
        headers: buildCSRFHeaders(),
      })
      if (result.success === false)
        throw new Error("We couldn't load the petitions. Please try again.")
      return result.data
    },
  })
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const result = await getCategories({ fields: ["id", "name"], headers: buildCSRFHeaders() })
      if (result.success === false) throw new Error("We couldn't load the categories.")
      return result.data
    },
  })

  const search = searchQuery.trim().toLowerCase()
  const filteredPetitions = useMemo(
    () =>
      (petitionsQuery.data ?? [])
        .filter(
          (petition) =>
            (!search ||
              `${petition.title ?? ""} ${petition.description ?? ""}`
                .toLowerCase()
                .includes(search)) &&
            (selectedCategory === "all" || petition.categoryId === selectedCategory),
        )
        .sort((a, b) => {
          switch (sortBy) {
            case "most-signed":
              return (b.signaturesCount ?? 0) - (a.signaturesCount ?? 0)
            case "newest":
              return (b.insertedAt ?? "").localeCompare(a.insertedAt ?? "")
            case "ending-soon": {
              const deadline = (petition: Petition) =>
                petition.status === "open" &&
                petition.deadline &&
                new Date(petition.deadline).getTime() > now
                  ? new Date(petition.deadline).getTime()
                  : Infinity
              return deadline(a) - deadline(b)
            }
            default:
              return (
                Number(b.trending) - Number(a.trending) ||
                (b.signaturesCount ?? 0) - (a.signaturesCount ?? 0)
              )
          }
        }),
    [petitionsQuery.data, search, selectedCategory, sortBy, now],
  )
  const pageCount = Math.max(1, Math.ceil(filteredPetitions.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visiblePetitions = filteredPetitions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const goToPage = (value: number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set("page", String(value))
      return next
    })
  }
  const hasFilters = searchQuery !== "" || selectedCategory !== "all"
  const clearFilters = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete("q")
      next.delete("category")
      next.delete("page")
      return next
    })
  }

  function renderPetitions() {
    if (petitionsQuery.isPending) {
      return (
        <div
          role="status"
          aria-label="Loading petitions"
          className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="app-panel min-h-80 space-y-6 motion-safe:animate-pulse">
              <div className="h-6 w-24 rounded-full bg-muted" />
              <div className="h-9 w-3/4 rounded bg-muted" />
              <div className="h-20 rounded bg-muted" />
              <div className="h-2 rounded bg-muted" />
            </div>
          ))}
        </div>
      )
    }
    if (petitionsQuery.isError) {
      return (
        <div role="alert" className="app-empty-state">
          <h2 className="font-display text-3xl">Petitions couldn't load.</h2>
          <p className="mt-3 mb-6 text-sm text-muted-foreground">Please try again in a moment.</p>
          <Button onClick={() => petitionsQuery.refetch()}>Try again</Button>
        </div>
      )
    }
    return (
      <>
        <div className="mb-5 flex items-center justify-between gap-4">
          <p role="status" className="text-sm text-muted-foreground">
            {filteredPetitions.length} {filteredPetitions.length === 1 ? "petition" : "petitions"}
            {hasFilters ? " found" : " to explore"}
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
        {filteredPetitions.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visiblePetitions.map((petition) => (
              <PetitionCard key={petition.id} petition={petition} />
            ))}
          </div>
        ) : (
          <div id="petitions-empty" className="app-empty-state">
            <span
              className="mb-5 hero-chat-bubble-left-right size-9 text-primary"
              aria-hidden="true"
            />
            <h2 className="font-display text-3xl">
              {hasFilters ? "No ideas found just yet." : "Your idea could be the first."}
            </h2>
            <p className="mt-3 mb-6 text-sm text-muted-foreground">
              {hasFilters
                ? "Try a different search or explore all petitions."
                : "Turn that thing you keep talking about into one clear ask."}
            </p>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link to={ROUTES.createPetition}>Start a petition</Link>
              </Button>
            )}
          </div>
        )}
        {pageCount > 1 ? (
          <nav aria-label="Petition pages" className="mt-8 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              Previous
            </Button>
            <p role="status" className="text-sm">
              Page {currentPage} of {pageCount}
            </p>
            <Button
              variant="outline"
              disabled={currentPage === pageCount}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
            </Button>
          </nav>
        ) : null}
      </>
    )
  }

  return (
    <main id="browse-petitions-page" className="app-page">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-9">
        <div className="max-w-2xl">
          <h1 className="app-page-heading">
            Find something worth
            <br className="hidden sm:block" /> speaking up about.
          </h1>
          <p className="app-page-description">
            Small asks. Shared ideas. Discover what your campus cares about, and add your voice.
          </p>
        </div>
        <Button id="browse-start-petition" asChild>
          <Link to={ROUTES.createPetition}>Start a petition</Link>
        </Button>
      </header>

      <section aria-label="Find petitions" className="mb-8 space-y-5">
        {renderCampusScope()}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PetitionSearch
            navigationKey={location.key}
            query={searchQuery}
            onSearch={setSearchQuery}
          />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger
              id="petition-sort"
              aria-label="Sort petitions"
              className="h-12 w-full rounded-full bg-white sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filter by category">
          <Button
            size="sm"
            variant={selectedCategory === "all" ? "default" : "outline"}
            aria-pressed={selectedCategory === "all"}
            onClick={() => setSelectedCategory("all")}
          >
            All petitions
          </Button>
          {categoryQuery.data?.map((category) => (
            <Button
              key={category.id}
              size="sm"
              variant={selectedCategory === category.id ? "default" : "outline"}
              aria-pressed={selectedCategory === category.id}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>
        {categoryQuery.isSuccess && categoryQuery.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories are available yet.</p>
        ) : null}
        {selectedCategory !== "all" &&
        categoryQuery.isSuccess &&
        !categoryQuery.data.some((category) => category.id === selectedCategory) ? (
          <p role="status" className="text-sm text-muted-foreground">
            This category is unavailable.{" "}
            <Button variant="link" onClick={() => setSelectedCategory("all")}>
              Show all categories
            </Button>
          </p>
        ) : null}
        {categoryQuery.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Categories are unavailable. You can still search petitions.{" "}
            <button
              className="underline underline-offset-4"
              onClick={() => categoryQuery.refetch()}
            >
              Try again
            </button>
          </p>
        ) : null}
      </section>

      {renderPetitions()}
    </main>
  )
}

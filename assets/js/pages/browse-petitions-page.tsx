import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Filter, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PetitionCard } from "../features/petition/petition-card"
import {
  buildCSRFHeaders,
  getCategories,
  getPetitions,
  PetitionResourceSchema,
  CategoryResourceSchema,
  UserResourceSchema,
} from "../ash_rpc"
import { CleanResource } from "../../lib/types"
import { useQuery } from "@tanstack/react-query"

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "most-signed", label: "Most Signed" },
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending Soon" },
]

type Category = CleanResource<CategoryResourceSchema>
type Petition = CleanResource<PetitionResourceSchema>
type User = CleanResource<UserResourceSchema>

function LoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Skeleton */}
        <div className="mb-12 text-center">
          <div className="h-12 md:h-14 lg:h-16 bg-muted rounded-lg w-3/4 mx-auto mb-4 animate-pulse"></div>
          <div className="h-6 bg-muted rounded-lg w-1/2 mx-auto animate-pulse"></div>
        </div>

        {/* Search Bar Skeleton */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-3xl mx-auto">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-muted rounded animate-pulse"></div>
            <div className="h-14 bg-muted rounded-lg w-full animate-pulse"></div>
          </div>

          {/* Filter Toggle Button Skeleton (Mobile) */}
          <div className="flex justify-center md:hidden">
            <div className="h-10 bg-muted rounded-lg w-32 animate-pulse"></div>
          </div>

          {/* Filters Skeleton */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center md:justify-start max-w-5xl mx-auto">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded-full w-20 animate-pulse"></div>
              ))}
            </div>

            {/* Sort Dropdown Skeleton */}
            <div className="flex items-center gap-2 justify-center md:justify-end max-w-5xl mx-auto">
              <div className="h-4 bg-muted rounded w-16 animate-pulse"></div>
              <div className="h-10 bg-muted rounded-lg w-[180px] animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Results Count Skeleton */}
        <div className="text-center mb-6">
          <div className="h-4 bg-muted rounded-lg w-32 mx-auto animate-pulse"></div>
        </div>

        {/* Petitions Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-6 space-y-4">
              {/* Title skeleton */}
              <div className="h-6 bg-muted rounded-lg w-3/4 animate-pulse"></div>
              
              {/* Description skeleton */}
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded-lg w-full animate-pulse"></div>
                <div className="h-4 bg-muted rounded-lg w-5/6 animate-pulse"></div>
                <div className="h-4 bg-muted rounded-lg w-4/6 animate-pulse"></div>
              </div>

              {/* Category and author skeleton */}
              <div className="flex items-center gap-4">
                <div className="h-6 bg-muted rounded-full w-20 animate-pulse"></div>
                <div className="h-4 bg-muted rounded-lg w-24 animate-pulse"></div>
              </div>

              {/* Stats skeleton */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-muted rounded-lg w-16 animate-pulse"></div>
                  <div className="h-4 bg-muted rounded-lg w-12 animate-pulse"></div>
                </div>
                <div className="h-8 bg-muted rounded-lg w-20 animate-pulse"></div>
              </div>

              {/* Progress bar skeleton */}
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full w-full animate-pulse"></div>
                <div className="flex justify-between">
                  <div className="h-3 bg-muted rounded-lg w-12 animate-pulse"></div>
                  <div className="h-3 bg-muted rounded-lg w-16 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default function BrowsePetitionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [sortBy, setSortBy] = useState("trending")
  const [showFilters, setShowFilters] = useState(false)

  const petitionsQuery = useQuery({
    queryKey: ["petitions"],
    queryFn: async () => {
      const result = await getPetitions({
        fields: [
          "id",
          "title",
          "description",
          "status",
          "goal",
          "signaturesCount",
          "daysLeft",
          "trending",
          "author",
          "categoryId",
          "allowComments",
          "isAnonymous",
          "deadline",
          { category: ["id", "name", "description"] },
          { comments: ["sentiment", "text"] },
          { signatures: ["reason", "userAgent"] },
          { updates: ["id", "title", "body"] },
        ],
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch petitions")
      }

      const fetchedPetitions: Petition[] = result.data
      return fetchedPetitions
    },
  })

  const categoryQuery = useQuery({
    queryKey: ["category"],
    queryFn: async () => {
      const result = await getCategories({
        fields: ["id", "description", "name"],
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch categories")
      }

      const fetchedCategory: Category[] = result.data
      return fetchedCategory
    },
  })

  switch (true) {
    case petitionsQuery.isError || categoryQuery.isError:
      return <div>Error: {petitionsQuery.error?.message ?? categoryQuery.error?.message}</div>
    case petitionsQuery.isPending || categoryQuery.isPending:
      return <LoadingState />
    case petitionsQuery.isSuccess || categoryQuery.isSuccess:
      break
    default:
      return <div>Unknown status: {petitionsQuery.status}</div>
  }

  const petitions = petitionsQuery.data
  const categories = categoryQuery.data

  const categoryNames = ["All", ...categories.map((c) => c.name || "General")]

  const filteredPetitions = petitions
    .filter((petition) => {
      const categoryName = petition.category?.name || "General"
      const matchesSearch =
        (petition.title?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        (petition.description?.toLowerCase() || "").includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === "All" || categoryName === selectedCategory

      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      const aSignatures = a.signaturesCount || 0
      const bSignatures = b.signaturesCount || 0
      const aDaysLeft = a.daysLeft || 0
      const bDaysLeft = b.daysLeft || 0
      const aTrending = a.trending ? 1 : 0
      const bTrending = b.trending ? 1 : 0

      switch (sortBy) {
        case "most-signed":
          return bSignatures - aSignatures
        case "newest":
          // UUIDv7 is time-sortable as string
          return b.id.localeCompare(a.id)
        case "ending-soon":
          return aDaysLeft - bDaysLeft
        case "trending":
          return bTrending - aTrending

        default:
          // Simple trending logic
          return bSignatures - aSignatures
      }
    })

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 text-balance">
            Browse Petitions
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
            Discover and support causes that matter to your university community
          </p>
        </div>

        {/* Search and Filter Section */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative max-w-3xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search petitions by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-4 h-14 text-base bg-card border-border"
            />
          </div>

          {/* Filter Toggle Button (Mobile) */}
          <div className="flex justify-center md:hidden">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </div>

          {/* Filters */}
          <div className={`${showFilters ? "block" : "hidden"} md:block`}>
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between max-w-5xl mx-auto">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {categoryNames.map((category) => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className="rounded-full"
                  >
                    {category}
                  </Button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 justify-center md:justify-end">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]">
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
            </div>

            {/* Active Filters Display */}
            {(searchQuery || selectedCategory !== "All") && (
              <div className="flex flex-wrap gap-2 items-center justify-center mt-4">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchQuery && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="gap-2 rounded-full"
                  >
                    Search: "{searchQuery}"
                    <X className="w-3 h-3" />
                  </Button>
                )}
                {selectedCategory !== "All" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedCategory("All")}
                    className="gap-2 rounded-full"
                  >
                    Category: {selectedCategory}
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">
            Showing {filteredPetitions.length}{" "}
            {filteredPetitions.length === 1 ? "petition" : "petitions"}
          </p>
        </div>

        {/* Petitions Grid */}
        {filteredPetitions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {filteredPetitions.map((petition) => (
              <PetitionCard key={petition.id} petition={petition} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground mb-4">
              No petitions found matching your criteria
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("")
                setSelectedCategory("All")
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

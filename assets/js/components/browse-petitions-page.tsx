// export const PetitionsPage = () => {
// const [petitions, setPetitions] = useState<SuccessDataFunc<typeof listPetitions>>([])

// useEffect(() => {
//   const fetchPetitions = async () => {
//     const result = await listPetitions({
//       fields: ["id", "title", "description", "status", "category", "goal", "trending"],
//       headers: buildCSRFHeaders(),
//     })
//     if (result.success) {
//       setPetitions(result.data as SuccessDataFunc<typeof listPetitions>)
//     }
//   }
//   fetchPetitions()
// }, [])

import { useState } from "react"
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
import { PetitionCard } from "./petition-card"

const SAMPLE_PETITIONS = [
  {
    id: 1,
    title: "Extend Library Hours During Finals Week",
    description:
      "Students need access to study spaces beyond current closing times. This petition calls for 24/7 library access during the final two weeks of each semester.",
    author: "Sarah Chen",
    category: "Academic",
    signatures: 2847,
    goal: 3000,
    daysLeft: 12,
    trending: true,
  },
  {
    id: 2,
    title: "Add More Vegetarian Options in Dining Halls",
    description:
      "Many students follow vegetarian diets but struggle to find adequate meal options. We request at least 3 vegetarian entrees at every meal service.",
    author: "Michael Rodriguez",
    category: "Campus Life",
    signatures: 1523,
    goal: 2000,
    daysLeft: 18,
    trending: true,
  },
  {
    id: 3,
    title: "Reduce Student Parking Fees",
    description:
      "Parking fees have increased 40% in the past two years. This petition asks the administration to reduce fees and offer more affordable alternatives.",
    author: "Jessica Williams",
    category: "Finance",
    signatures: 3421,
    goal: 5000,
    daysLeft: 25,
    trending: false,
  },
  {
    id: 4,
    title: "Implement Mental Health Days",
    description:
      "Students need mental health support. This petition proposes 2 excused mental health days per semester without penalty to academic standing.",
    author: "Alex Thompson",
    category: "Wellness",
    signatures: 4156,
    goal: 4000,
    daysLeft: 8,
    trending: true,
  },
  {
    id: 5,
    title: "Increase Campus Safety Lighting",
    description:
      "Several areas of campus are poorly lit at night. This petition requests additional lighting installations for student safety.",
    author: "Emily Davis",
    category: "Safety",
    signatures: 1890,
    goal: 2500,
    daysLeft: 15,
    trending: false,
  },
  {
    id: 6,
    title: "Add Lactation Rooms Across Campus",
    description:
      "New parents need accessible, private spaces for nursing. This petition calls for dedicated lactation rooms in every major building.",
    author: "Maria Garcia",
    category: "Accessibility",
    signatures: 876,
    goal: 1500,
    daysLeft: 22,
    trending: false,
  },
]

const CATEGORIES = [
  "All",
  "Academic",
  "Campus Life",
  "Finance",
  "Wellness",
  "Safety",
  "Accessibility",
]
const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "most-signed", label: "Most Signed" },
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending Soon" },
]

export default function BrowsePetitionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [sortBy, setSortBy] = useState("trending")
  const [showFilters, setShowFilters] = useState(false)

  const filteredPetitions = SAMPLE_PETITIONS.filter((petition) => {
    const matchesSearch =
      petition.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      petition.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "All" || petition.category === selectedCategory

    return matchesSearch && matchesCategory
  }).sort((a, b) => {
    switch (sortBy) {
      case "most-signed":
        return b.signatures - a.signatures
      case "newest":
        return b.id - a.id
      case "ending-soon":
        return a.daysLeft - b.daysLeft
      case "trending":
      default:
        return (b.trending ? 1 : 0) - (a.trending ? 1 : 0)
    }
  })

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Header */}
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
                {CATEGORIES.map((category) => (
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

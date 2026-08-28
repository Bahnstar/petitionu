import React from "react"
import { buildCSRFHeaders, getPetitions, SuccessDataFunc } from "../ash_rpc"
import { Hero } from "../features/home/hero"
import { Stats } from "../features/home/stats"
import { PetitionGrid } from "../features/petition/petition-grid"
import { CreatePetitionCTA } from "../features/home/create-petition-cta"
import { useQuery } from "@tanstack/react-query"
import { useDocumentTitle } from "../hooks/use-document-title"

export const HomePage = () => {
  useDocumentTitle("Home")

  const petitionsQuery = useQuery({
    queryKey: ["homePetitions"],
    queryFn: async () => {
      const result = await getPetitions({
        fields: ["id", "title", "description"],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(
          `Failed to fetch petitions: ${result.errors.map((e) => e.message).join(", ")}`,
        )
      }

      return result.data as SuccessDataFunc<typeof getPetitions>
    },
  })

  // Handle loading and error states
  if (petitionsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-muted rounded-lg"></div>
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (petitionsQuery.isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to load petitions</h2>
          <p className="text-muted-foreground mb-4">
            {petitionsQuery.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => petitionsQuery.refetch()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Hero />
      <Stats />
      <PetitionGrid petitions={petitionsQuery.data || []} />
      <CreatePetitionCTA />
    </>
  )
}

import React from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { HomePrototype } from "./home-prototype"
import { homePrototypesEnabled } from "../components/prototype-switcher"
import { useDocumentTitle } from "../hooks/use-document-title"
import { LandingPage } from "./landing-page"

export const HomePage = () => {
  useDocumentTitle("Your campus. Your say.")
  const [searchParams] = useSearchParams()

  if (
    process.env.NODE_ENV === "development" &&
    homePrototypesEnabled &&
    searchParams.has("variant")
  ) {
    return <PrototypePage />
  }

  return <LandingPage />
}

// Keep the prototype's data query out of the public landing page.
function PrototypePage() {
  const petitionsQuery = useQuery({
    queryKey: ["homePetitions"],
    queryFn: async () => {
      const result = await api.getPetitions({})

      if (result.success === false) {
        throw new Error(
          `Failed to fetch petitions: ${result.errors.map((e) => e.message).join(", ")}`,
        )
      }

      return result.data.map(({ id, title, description }) => ({
        id,
        title: title ?? "",
        description,
      }))
    },
  })

  return <HomePrototype petitions={petitionsQuery.data || []} queryStatus={petitionsQuery.status} />
}

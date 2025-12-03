import React, { useEffect, useState } from "react"
import { buildCSRFHeaders, getOrganizations, getPetitions, SuccessDataFunc } from "../ash_rpc"
import { Hero } from "../features/home/hero"
import { Stats } from "../features/home/stats"
import { PetitionGrid } from "../features/petition/petition-grid"
import { CreatePetitionCTA } from "../features/home/create-petition-cta"

export const HomePage = () => {
  const [petitions, setPetitions] = useState<SuccessDataFunc<typeof getPetitions>>([])

  useEffect(() => {
    const fetchPetitions = async () => {
      const result = await getPetitions({
        fields: ["id", "title", "description"],
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        console.error("Failed to fetch petitions:", result)
        return
      }

      setPetitions(result.data as SuccessDataFunc<typeof getPetitions>)
    }

    fetchPetitions()

    const fetchOrganizations = async () => {
      const organizations = await getOrganizations({
        fields: ["id", "name"],
        headers: buildCSRFHeaders(),
      })
    }

    fetchOrganizations()
  }, [])

  return (
    <>
      <Hero />
      <Stats />
      <PetitionGrid />
      <CreatePetitionCTA />
    </>
  )
}

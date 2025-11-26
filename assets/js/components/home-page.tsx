import React, { useEffect, useState } from "react"
import {
  buildCSRFHeaders,
  createPetition,
  getOrganizations,
  getPetitions,
  SuccessDataFunc,
} from "../ash_rpc"
import { Hero } from "./hero"
import { Stats } from "./stats"
import { PetitionGrid } from "./petition-grid"
import { CreatePetitionCTA } from "./create-petition-cta"

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

  const createPetitionAction = async () => {
    const petition = await createPetition({
      fields: ["title", "description", "status"],
      input: {
        title: "New Petition",
        description: "This is a new petition",
        status: "open",
      },
      headers: buildCSRFHeaders(),
    })
    console.log(petition)
  }

  return (
    <>
      <Hero />
      <Stats />
      <PetitionGrid />
      <CreatePetitionCTA />
    </>
  )
}

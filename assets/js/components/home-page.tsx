import React, { useEffect, useState } from "react"
import {
  buildCSRFHeaders,
  createPetition,
  getOrganizations,
  listPetitions,
  SuccessDataFunc,
} from "../ash_rpc"
import { Hero } from "./hero"
import { Stats } from "./stats"
import { PetitionGrid } from "./petition-grid"
import { CreatePetitionCTA } from "./create-petition-cta"

export const HomePage = () => {
  const [petitions, setPetitions] = useState<SuccessDataFunc<typeof listPetitions>>([])
  
  useEffect(() => {
    const fetchPetitions = async () => {
      const getPetitions = await listPetitions({
        fields: ["id", "title", "description"],
        headers: buildCSRFHeaders(),
      })

      if (!getPetitions.success) {
        console.error("Failed to fetch petitions:", getPetitions)
        return
      }

      setPetitions(getPetitions.data as SuccessDataFunc<typeof listPetitions>)
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
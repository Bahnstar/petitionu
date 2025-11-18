import React, { useEffect, useState } from "react"
import { buildCSRFHeaders, listPetitions, SuccessDataFunc } from "../ash_rpc"
import { Link } from "react-router-dom"

export const PetitionsPage = () => {
  const [petitions, setPetitions] = useState<SuccessDataFunc<typeof listPetitions>>([])

  useEffect(() => {
    const fetchPetitions = async () => {
      const result = await listPetitions({
        fields: ["id", "title", "description", "status", "category", "goal", "trending"],
        headers: buildCSRFHeaders(),
      })
      if (result.success) {
        setPetitions(result.data as SuccessDataFunc<typeof listPetitions>)
      }
    }
    fetchPetitions()
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-slate-900 mb-8">All Petitions</h1>
      <Link to={`/ash-typescript/petitions/${1}`}>
        <div className="grid gap-6">
          {petitions.map((petition) => (
            <div
              key={petition.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{petition.title}</h2>
              <p className="text-slate-600 mb-4">{petition.description}</p>
              <div className="flex gap-4 text-sm">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
                  {petition.status}
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full">
                  {petition.category}
                </span>
                {petition.trending && (
                  <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full">
                    Trending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Link>
    </div>
  )
}

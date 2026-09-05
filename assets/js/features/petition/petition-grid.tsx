import { Link } from "react-router-dom"
import { PetitionCard } from "./petition-card"
import { PetitionResourceSchema } from "../../ash_rpc"
import { CleanResource } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"

interface PetitionGridProps {
  petitions?: CleanResource<PetitionResourceSchema>[]
}

export function PetitionGrid({ petitions = [] }: PetitionGridProps) {
  return (
    <section id="petitions" className="py-12 lg:py-16">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="mb-2 font-display text-4xl tracking-tight text-foreground">Ideas finding their people.</h2>
            <p className="text-sm text-muted-foreground">Discover what your community is speaking up about.</p>
          </div>
          <Button variant="outline" asChild><Link to={ROUTES.petitions}>Browse petitions</Link></Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {petitions.length > 0 ? petitions.map((petition) => (
            <PetitionCard key={petition.id} petition={petition} />
          )) : (
            <div className="app-empty-state col-span-full">
              <h3 className="font-display text-3xl">One idea is a good place to start.</h3>
              <p className="mb-6 mt-3 text-sm text-muted-foreground">Be the first to share a change you'd like to see.</p>
              <Button asChild><Link to={ROUTES.createPetition}>Start a petition</Link></Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

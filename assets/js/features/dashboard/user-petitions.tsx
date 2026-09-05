import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CleanResource } from "@/lib/types"
import { PetitionResourceSchema } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"

type Petition = CleanResource<PetitionResourceSchema>

export function UserPetitions({ petitions }: { petitions: Petition[] }) {
  return (
    <section id="dashboard-your-petitions" className="app-panel" aria-labelledby="your-petitions-heading">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="your-petitions-heading" className="font-display text-3xl tracking-tight">Your petitions</h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">{petitions.length} recent</span>
      </div>
      {petitions.length === 0 ? (
        <div className="rounded-2xl bg-background px-5 py-8">
          <h3 className="font-display text-2xl">One idea is a good place to start.</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">A better study space, a more welcoming campus. What would you like to change?</p>
          <Button asChild variant="outline" className="mt-5"><Link to={ROUTES.createPetition}>Start your first petition</Link></Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {petitions.map((petition) => {
            const signatures = petition.signaturesCount ?? 0
            const goal = petition.goal ?? 0
            const progress = goal > 0 ? Math.min(100, Math.max(0, (signatures / goal) * 100)) : 0
            const daysLeft = petition.deadline ? Math.ceil((Date.parse(petition.deadline) - Date.now()) / 86_400_000) : null
            return (
              <article key={petition.id} className="py-5 first:pt-0 last:pb-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {petition.category?.name ? <Badge variant="secondary">{petition.category.name}</Badge> : null}
                  <Badge variant="outline" className="capitalize">{petition.status}</Badge>
                </div>
                <h3 className="text-lg font-medium leading-snug">
                  <Link id={`dashboard-petition-${petition.id}`} to={ROUTES.petition(petition.id)} className="rounded-sm decoration-primary/40 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{petition.title}</Link>
                </h3>
                {petition.description ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{petition.description}</p> : null}
                <div className="mb-2 mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span><strong className="font-medium text-foreground">{signatures.toLocaleString()}</strong> {goal > 0 ? `of ${goal.toLocaleString()} signatures` : "signatures"}</span>
                  {daysLeft != null && Number.isFinite(daysLeft) && petition.status === "open" ? <span>{daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : "Deadline reached"}</span> : null}
                </div>
                <Progress value={progress} className="h-1.5" aria-label={`Signature goal for ${petition.title}`} />
                {goal > 0 && signatures >= goal ? <p className="mt-2 text-xs font-medium text-primary">You reached your signature goal.</p> : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CleanResource } from "@/lib/types"
import { SignatureResourceSchema } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"

type Signature = CleanResource<SignatureResourceSchema>

export function SignedPetitions({ signedPetitions }: { signedPetitions: Signature[] }) {
  const visibleSignatures = signedPetitions.filter((signature) => signature.petition)

  return (
    <section id="dashboard-signed-petitions" className="app-panel" aria-labelledby="signed-petitions-heading">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="signed-petitions-heading" className="font-display text-3xl tracking-tight">Ideas you’re standing behind</h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">{visibleSignatures.length} recent</span>
      </div>
      {visibleSignatures.length === 0 ? (
        <div className="rounded-2xl bg-background px-5 py-8">
          <p className="text-sm leading-relaxed text-muted-foreground">You haven’t signed a petition yet. Find an idea that matters to you and add your voice.</p>
          <Button asChild variant="outline" className="mt-5"><Link to={ROUTES.petitions}>Explore petitions</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleSignatures.map(({ id, petition }) => {
            const signatures = petition.signaturesCount ?? 0
            const goal = petition.goal ?? 0
            const progress = goal > 0 ? Math.min(100, Math.max(0, (signatures / goal) * 100)) : 0
            const author = petition.isAnonymous ? "Anonymous" : [petition.user?.firstName, petition.user?.lastName].filter(Boolean).join(" ")
            return (
              <article key={id} className="flex flex-col rounded-2xl border border-border p-5">
                {petition.category?.name ? <Badge variant="secondary" className="mb-3 self-start">{petition.category.name}</Badge> : null}
                <h3 className="text-base font-medium leading-snug">
                  <Link id={`dashboard-signed-${id}`} to={ROUTES.petition(petition.id)} className="rounded-sm decoration-primary/40 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{petition.title}</Link>
                </h3>
                {author ? <p className="mt-2 text-xs text-muted-foreground">Started by {author}</p> : null}
                <div className="mt-auto pt-5">
                  <p className="mb-2 text-xs text-muted-foreground"><strong className="font-medium text-foreground">{signatures.toLocaleString()}</strong> {goal > 0 ? `of ${goal.toLocaleString()} signatures` : "signatures"}</p>
                  <Progress value={progress} className="h-1.5" aria-label={`Signature goal for ${petition.title}`} />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

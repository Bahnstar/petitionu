import { Link } from "react-router-dom"
import { CleanResource } from "@/lib/types"
import { PetitionResourceSchema, SignatureResourceSchema } from "@/js/ash_rpc"
import { ROUTES } from "@/lib/routes"

interface RecentActivityProps {
  petitions: CleanResource<PetitionResourceSchema>[]
  signatures: CleanResource<SignatureResourceSchema>[]
}

const activityDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

export function RecentActivity({ petitions, signatures }: RecentActivityProps) {
  const activities = [
    ...petitions.map((petition) => ({
      id: `petition-${petition.id}`,
      title: petition.title,
      petitionId: petition.id,
      date: petition.insertedAt,
      action: "You started",
    })),
    ...signatures.filter((signature) => signature.petition).map((signature) => ({
      id: `signature-${signature.id}`,
      title: signature.petition.title,
      petitionId: signature.petition.id,
      date: signature.insertedAt,
      action: "You signed",
    })),
  ].filter((activity) => activity.date && Number.isFinite(Date.parse(activity.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 5)

  return (
    <section id="dashboard-recent-activity" className="app-panel" aria-labelledby="recent-activity-heading">
      <h2 id="recent-activity-heading" className="mb-5 font-display text-2xl tracking-tight">Your recent activity</h2>
      {activities.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">When you start or sign a petition, you’ll find it here.</p>
      ) : (
        <ol className="divide-y divide-border">
          {activities.map((activity) => (
            <li key={activity.id} className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs text-muted-foreground">{activity.action}</p>
              <Link to={ROUTES.petition(activity.petitionId)} className="mt-1 block rounded-sm text-sm font-medium leading-relaxed underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{activity.title}</Link>
              <time dateTime={activity.date} className="mt-1 block text-xs text-muted-foreground">{activityDate.format(new Date(activity.date))}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

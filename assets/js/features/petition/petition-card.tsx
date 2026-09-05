import { CleanResource } from "@/lib/types"
import { Link } from "react-router-dom"
import { PetitionResourceSchema } from "../../ash_rpc"
import { ROUTES } from "@/lib/routes"

type Petition = CleanResource<PetitionResourceSchema>

export function PetitionCard({ petition }: { petition: Petition }) {
  const signatures = petition.signaturesCount ?? 0
  const goal = petition.goal ?? 0
  const progress = goal > 0 ? Math.min(100, Math.max(0, signatures / goal * 100)) : 0
  const daysLeft = petition.deadline ? Math.max(0, Math.ceil((new Date(petition.deadline).getTime() - Date.now()) / 86_400_000)) : null
  const closed = petition.status !== "open" || (petition.deadline && new Date(petition.deadline) <= new Date())

  return (
    <Link
      id={`petition-${petition.id}`}
      to={ROUTES.petition(petition.id)}
      className="group flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:p-7"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          {petition.category?.name ?? "General"}
        </span>
        {petition.status === "victory" ? (
          <span className="rounded-full bg-[#f5cfdc] px-3 py-1 text-xs text-[#663e51]">Victory</span>
        ) : petition.trending ? (
          <span className="rounded-full bg-[#f7e8d2] px-3 py-1 text-xs text-[#685649]">Gathering support</span>
        ) : null}
      </div>
      <h3 className="mb-3 break-words font-display text-[29px] leading-[1.12] tracking-tight text-foreground group-hover:underline decoration-1 underline-offset-4">
        {petition.title}
      </h3>
      <p className="mb-5 line-clamp-3 text-sm leading-7 text-muted-foreground">{petition.description}</p>
      <p className="mb-7 text-xs text-muted-foreground">Started by {petition.isAnonymous ? "Anonymous" : petition.author || "a campus community member"}</p>
      <div className="mt-auto space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span><strong className="text-base font-medium">{signatures.toLocaleString()}</strong> signatures</span>
          <span className="text-muted-foreground">{closed ? "Closed" : petition.deadline ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : "Open for signatures"}</span>
        </div>
        <div role={goal > 0 ? "progressbar" : undefined} aria-label={goal > 0 ? "Signature goal" : undefined} aria-valuenow={goal > 0 ? Math.round(progress) : undefined} aria-valuemin={goal > 0 ? 0 : undefined} aria-valuemax={goal > 0 ? 100 : undefined} className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{goal > 0 ? `of ${goal.toLocaleString()} signatures` : "Every voice counts"}</span>
          <span className="font-medium">Read petition <span className="hero-arrow-up-right ml-1 size-3" aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  )
}

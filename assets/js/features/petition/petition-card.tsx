import { CleanResource } from "@/lib/types"
import { TrendingUp, User } from "lucide-react"
import { Link } from "react-router-dom"
import { PetitionResourceSchema } from "../../ash_rpc"
import { Button } from "@/components/ui/button"

type Petition = CleanResource<PetitionResourceSchema>

export function PetitionCard({ petition }: { petition: Petition }) {
  const progress = ((petition.signaturesCount ?? 0) / (petition.goal ?? 1)) * 100

  return (
    <Link to={`/ash-typescript/petitions/${petition.id}`}>
      <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow duration-300">
        <div className="flex items-start justify-between mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
            {petition.category?.name ?? "Blank Category"}
          </span>
          {petition.trending && (
            <div className="flex items-center gap-1 text-primary">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Trending</span>
            </div>
          )}
        </div>

        <h3 className="text-xl font-semibold text-foreground mb-3 text-balance leading-snug">
          {petition.title}
        </h3>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-3 leading-relaxed">
          {petition.description}
        </p>

        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>by {petition.author}</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              {petition.signaturesCount?.toLocaleString()} signatures
            </span>
            <span className="text-muted-foreground">{petition.daysLeft} days left</span>
          </div>

          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {Math.round(progress)}% of {petition.goal?.toLocaleString()} goal
          </div>
        </div>

        {/*<Link to={`/petition/${petition.id}`}>*/}
        <Button className="w-full mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
          Sign This Petition
        </Button>
        {/*</Link>*/}
      </div>
    </Link>
  )
}

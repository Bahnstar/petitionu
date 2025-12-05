import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MoreHorizontal, TrendingUp, Users, Calendar } from "lucide-react"
import { CleanResource } from "@/lib/types"
import { PetitionResourceSchema } from "@/js/ash_rpc"

type Petition = CleanResource<PetitionResourceSchema>
type Petitions = Petition[]

interface UserPetitionsProps {
  petitions: Petitions
}

export function UserPetitions({ petitions }: UserPetitionsProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Your Petitions</h2>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {petitions.map((petition) => {
          const progress = (petition.signaturesCount / petition.goal) * 100

          return (
            // <Link key={petition.id} href={`/petition/${petition.id}`} className="block group">
            <div className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300 bg-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {petition.category.name!}
                    </Badge>
                    {petition.trending && (
                      <Badge
                        variant="default"
                        className="text-xs bg-primary text-primary-foreground"
                      >
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Trending
                      </Badge>
                    )}
                    <Badge
                      variant={petition.status === "open" ? "default" : "outline"}
                      className="text-xs capitalize"
                    >
                      {petition.status}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2 text-balance">
                    {petition.title}
                  </h3>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      {petition.signaturesCount.toLocaleString()} signatures
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {Date()}
                      {/*{petition.created}*/}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-medium">{Math.round(progress)}%</span>
                </div>

                <Progress value={progress} className="h-2" />

                <div className="text-xs text-muted-foreground">
                  {petition.goal - petition.signaturesCount > 0 ? (
                    <span>
                      {(petition.goal - petition.signaturesCount).toLocaleString()} more needed to
                      reach goal
                    </span>
                  ) : (
                    <span className="text-primary font-medium">Goal reached! 🎉</span>
                  )}
                </div>
              </div>
            </div>
            // </Link>
          )
        })}
      </div>
    </Card>
  )
}

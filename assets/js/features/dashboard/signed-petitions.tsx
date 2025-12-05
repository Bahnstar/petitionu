import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Users, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CleanResource } from "@/lib/types"
import { SignatureResourceSchema } from "@/js/ash_rpc"

type Signature = CleanResource<SignatureResourceSchema>
type Signatures = Signature[]

interface SignedPetitionsProps {
  signedPetitions: Signatures
}

export function SignedPetitions({ signedPetitions }: SignedPetitionsProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Petitions You've Signed</h2>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {signedPetitions.map((signedPetition) => {
          const progress =
            (signedPetition.petition.signaturesCount / signedPetition.petition.goal) * 100

          return (
            // <Link key={petition.id} href={`/petition/${petition.id}`} className="block group">
            <div className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300 bg-card h-full">
              <div className="flex items-start gap-2 mb-3">
                <Badge variant="secondary" className="text-xs">
                  {signedPetition.petition.category.name}
                </Badge>
                {signedPetition.petition.trending && (
                  <Badge variant="default" className="text-xs bg-primary text-primary-foreground">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                )}
              </div>

              <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors mb-2 text-balance leading-snug">
                {signedPetition.petition.title}
              </h3>

              <p className="text-sm text-muted-foreground mb-4">
                By {signedPetition.petition.user.firstName} {signedPetition.petition.user.lastName}
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {signedPetition.petition.signaturesCount}
                  </span>
                  <span className="text-muted-foreground font-medium">{Math.round(progress)}%</span>
                </div>

                <Progress value={progress} className="h-1.5" />
              </div>
            </div>
            // </Link>
          )
        })}
      </div>
    </Card>
  )
}

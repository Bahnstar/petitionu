import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Users, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SignedPetitions() {
  const petitions = [
    {
      id: 4,
      title: "Create More Study Spaces on Campus",
      category: "Academics",
      author: "Marcus Johnson",
      signatures: 3421,
      goal: 5000,
      trending: true,
    },
    {
      id: 5,
      title: "Implement Mental Health Days for Students",
      category: "Student Wellness",
      author: "Emma Williams",
      signatures: 4872,
      goal: 5000,
      trending: false,
    },
    {
      id: 6,
      title: "Lower Parking Permit Fees",
      category: "Campus Life",
      author: "David Martinez",
      signatures: 1567,
      goal: 3000,
      trending: false,
    },
  ]

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Petitions You've Signed</h2>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {petitions.map((petition) => {
          const progress = (petition.signatures / petition.goal) * 100

          return (
            // <Link key={petition.id} href={`/petition/${petition.id}`} className="block group">
            <div className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300 bg-card h-full">
              <div className="flex items-start gap-2 mb-3">
                <Badge variant="secondary" className="text-xs">
                  {petition.category}
                </Badge>
                {petition.trending && (
                  <Badge variant="default" className="text-xs bg-primary text-primary-foreground">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                )}
              </div>

              <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors mb-2 text-balance leading-snug">
                {petition.title}
              </h3>

              <p className="text-sm text-muted-foreground mb-4">By {petition.author}</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {petition.signatures.toLocaleString()}
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

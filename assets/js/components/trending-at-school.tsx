import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Users } from "lucide-react"

interface TrendingAtSchoolProps {
  school: string
}

export function TrendingAtSchool({ school }: TrendingAtSchoolProps) {
  const trending = [
    {
      id: 7,
      title: "Reduce Textbook Costs",
      signatures: 2890,
      growth: "+340 today",
    },
    {
      id: 8,
      title: "Free Menstrual Products",
      signatures: 1967,
      growth: "+215 today",
    },
    {
      id: 9,
      title: "Expand Career Services",
      signatures: 1523,
      growth: "+189 today",
    },
    {
      id: 10,
      title: "More Sustainable Practices",
      signatures: 1342,
      growth: "+156 today",
    },
  ]

  return (
    <Card className="p-6 sticky top-24">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Trending at {school}</h2>
      </div>

      <div className="space-y-3">
        {trending.map((petition, index) => (
          // <Link key={petition.id} href={`/petition/${petition.id}`} className="block group">
          <div className="p-3 rounded-lg hover:bg-accent transition-colors">
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="shrink-0 w-6 h-6 flex items-center justify-center p-0 text-xs"
              >
                {index + 1}
              </Badge>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors mb-1 text-balance leading-snug">
                  {petition.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {petition.signatures.toLocaleString()}
                  </span>
                  <span className="text-primary font-medium">{petition.growth}</span>
                </div>
              </div>
            </div>
          </div>
          // </Link>
        ))}
      </div>
    </Card>
  )
}

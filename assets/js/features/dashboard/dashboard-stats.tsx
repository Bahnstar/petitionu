import { Card } from "@/components/ui/card"
import { FileText, Users, TrendingUp, Award } from "lucide-react"

interface DashboardStatsProps {
  numPetitions: number
  numSigned: number
  numSupporters: number
}

export function DashboardStats(props: DashboardStatsProps) {
  const stats = [
    {
      label: "Petitions Created",
      value: props.numPetitions,
      change: "+1 this month",
      icon: FileText,
      color: "text-chart-1",
    },
    {
      label: "Petitions Signed",
      value: props.numSigned,
      change: "+5 this week",
      icon: Users,
      color: "text-chart-2",
    },
    {
      label: "Total Supporters",
      value: props.numSupporters,
      change: "Across your petitions",
      icon: TrendingUp,
      color: "text-chart-3",
    },
    {
      label: "Impact Score",
      value: "89",
      change: "Top 10% at your school",
      icon: Award,
      color: "text-chart-4",
    },
  ]

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card
          key={stat.label}
          className="p-6 hover:shadow-lg transition-all duration-300 border-border animate-in fade-in slide-in-from-bottom-4"
          style={{ animationDelay: `${index * 100}ms`, animationFillMode: "backwards" }}
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className={`w-10 h-10 rounded-lg bg-accent flex items-center justify-center ${stat.color}`}
            >
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
          <div className="text-sm text-muted-foreground mb-1">{stat.label}</div>
          <div className="text-xs text-muted-foreground">{stat.change}</div>
        </Card>
      ))}
    </div>
  )
}

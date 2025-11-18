import { Clock, MessageCircle, UserPlus, FileText } from "lucide-react"

export function RecentActivity() {
  const activities = [
    {
      type: "comment",
      icon: MessageCircle,
      text: "New comment on",
      petition: "Library Hours",
      time: "2 hours ago",
      color: "text-chart-2",
    },
    {
      type: "signature",
      icon: UserPlus,
      text: "50 new signatures on",
      petition: "Dining Options",
      time: "5 hours ago",
      color: "text-chart-3",
    },
    {
      type: "update",
      icon: FileText,
      text: "Status update for",
      petition: "WiFi Infrastructure",
      time: "1 day ago",
      color: "text-chart-1",
    },
    {
      type: "signature",
      icon: UserPlus,
      text: "100 new signatures on",
      petition: "Library Hours",
      time: "2 days ago",
      color: "text-chart-3",
    },
  ]

  return (
    // was card
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
      </div>

      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 ${activity.color}`}
            >
              <activity.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-relaxed">
                {activity.text}{" "}
                <span className="font-medium text-primary">{activity.petition}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

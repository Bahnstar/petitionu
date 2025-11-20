import { Bell, TrendingUp } from "lucide-react"
import { DashboardStats } from "./dashboard-stats"
import { UserPetitions } from "./user-petitions"
import { SignedPetitions } from "./signed-petitions"
import { TrendingAtSchool } from "./trending-at-school"
import { RecentActivity } from "./recent-activity"
import { useEffect, useState } from "react"
import { buildCSRFHeaders, listPetitions } from "../ash_rpc"

export default function Dashboard() {
  console.log("blah goober")
  const [petitions, setPetitions] = useState()
  useEffect(() => {
    const fetchPetitions = async () => {
      const getPetitions = await listPetitions({
        fields: ["id", "title", "description"],
        headers: buildCSRFHeaders(),
      })

      if (!getPetitions.success) {
        console.error("Failed to fetch petitions:", getPetitions)
        return
      }

      console.log(getPetitions.data)
      setPetitions(getPetitions.data)
    }
    fetchPetitions()
  }, [])

  // Mock user data - would come from authentication in real app
  const user = {
    name: "Sarah Chen",
    school: "UC Berkeley",
    role: "Student",
    joinedDate: "January 2024",
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Welcome Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2 text-balance">
              Welcome back, {user.name}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              {/*<Badge variant="secondary" className="font-normal">*/}
              {user.school}
              {/*</Badge>*/}
              <span className="text-sm">
                {user.role} • Member since {user.joinedDate}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-md">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                3
              </span>
            </button>
            <button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <TrendingUp className="w-4 h-4 mr-2" />
              Start New Petition
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <DashboardStats />

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 mt-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <UserPetitions />
            <SignedPetitions />
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            <TrendingAtSchool school={user.school} />
            <RecentActivity />
          </div>
        </div>
      </div>
    </main>
  )
}

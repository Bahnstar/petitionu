import { Bell, TrendingUp } from "lucide-react"
import { DashboardStats } from "../features/dashboard/dashboard-stats"
import { UserPetitions } from "../features/dashboard/user-petitions"
import { SignedPetitions } from "../features/dashboard/signed-petitions"
import { TrendingAtSchool } from "../features/dashboard/trending-at-school"
import { RecentActivity } from "../features/dashboard/recent-activity"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { buildCSRFHeaders, getPetitions, getUserById, UserResourceSchema } from "../ash_rpc"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CleanResource } from "@/lib/types"

type User = CleanResource<UserResourceSchema>

export default function Dashboard() {
  const petitionsQuery = useQuery({
    queryKey: ["petitions"],
    queryFn: async () => {
      const result = await getPetitions({
        fields: ["id", "title", "description"],
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        console.error("Failed to fetch petitions:", result)
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch petitions")
      }

      console.log(result.data)
      return result.data
    },
  })

  const userQuery = useQuery({
    queryKey: ["apiUser"],
    queryFn: async () => {
      const result = await getUserById({
        input: { id: "8eebb180-33a8-47d8-90e8-74b794694c18", includeStats: true },
        fields: ["id", "email", "firstName", "lastName", "numPetitions", "numSigned"],
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch user")
      }

      const fetchedUser: User = result.data
      return fetchedUser
    },
  })

  console.log(userQuery.data)
  const apiUser = userQuery.data

  switch (true) {
    case petitionsQuery.isError || userQuery.isError:
      return <div>Error: {petitionsQuery.error?.message ?? userQuery.error?.message}</div>
    case petitionsQuery.isPending || userQuery.isPending:
      return <div>Loading...</div>
    case petitionsQuery.isSuccess || userQuery.isSuccess:
      break
    default:
      return <div>Unknown status: {petitionsQuery.status}</div>
  }

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
              <Badge variant="secondary" className="font-normal">
                {user.school}
              </Badge>
              <span className="text-sm">
                {user.role} • Member since {user.joinedDate}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button className="relative p-2 rounded-md">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                3
              </span>
            </Button>
            <Link to={`/ash-typescript/create`}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <TrendingUp className="w-4 h-4 mr-2" />
                Start New Petition
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <DashboardStats
          numPetitions={apiUser.numPetitions}
          numSigned={apiUser.numSigned}
          numSupporters={25}
        />

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

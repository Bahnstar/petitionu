import { Bell, TrendingUp } from "lucide-react"
import { DashboardStats } from "../features/dashboard/dashboard-stats"
import { UserPetitions } from "../features/dashboard/user-petitions"
import { SignedPetitions } from "../features/dashboard/signed-petitions"
import { TrendingAtSchool } from "../features/dashboard/trending-at-school"
import { RecentActivity } from "../features/dashboard/recent-activity"
import { Button } from "@/components/ui/button"
import { buildCSRFHeaders, getUserById, UserResourceSchema } from "../ash_rpc"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CleanResource } from "@/lib/types"

type User = CleanResource<UserResourceSchema>

function DashboardLoadingState() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Welcome Section Skeleton */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <div className="h-10 lg:h-12 bg-muted rounded-lg w-64 mb-2 animate-pulse"></div>
            <div className="flex items-center gap-2">
              <div className="h-6 bg-muted rounded-lg w-24 animate-pulse"></div>
              <div className="h-4 bg-muted rounded-lg w-32 animate-pulse"></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative p-2 rounded-md h-10 w-10 bg-muted animate-pulse"></div>
            <div className="h-10 bg-muted rounded-lg w-40 animate-pulse"></div>
          </div>
        </div>

        {/* Stats Overview Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-6">
              <div className="h-4 bg-muted rounded-lg w-20 mb-2 animate-pulse"></div>
              <div className="h-8 bg-muted rounded-lg w-16 animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Main Grid Skeleton */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Main Content Skeleton */}
          <div className="lg:col-span-2 space-y-6">
            {/* User Petitions Skeleton */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 bg-muted rounded-lg w-32 animate-pulse"></div>
                <div className="h-8 bg-muted rounded-lg w-24 animate-pulse"></div>
              </div>
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="border-b border-border pb-4 last:border-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-muted rounded-lg w-3/4 animate-pulse"></div>
                        <div className="h-4 bg-muted rounded-lg w-full animate-pulse"></div>
                        <div className="h-4 bg-muted rounded-lg w-2/3 animate-pulse"></div>
                        <div className="flex items-center gap-4 mt-3">
                          <div className="h-4 bg-muted rounded-lg w-16 animate-pulse"></div>
                          <div className="h-4 bg-muted rounded-lg w-20 animate-pulse"></div>
                          <div className="h-6 bg-muted rounded-full w-16 animate-pulse"></div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-6 bg-muted rounded-lg w-20 animate-pulse"></div>
                        <div className="h-2 bg-muted rounded-full w-24 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signed Petitions Skeleton */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 bg-muted rounded-lg w-32 animate-pulse"></div>
                <div className="h-8 bg-muted rounded-lg w-24 animate-pulse"></div>
              </div>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border-b border-border pb-4 last:border-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-muted rounded-lg w-3/4 animate-pulse"></div>
                        <div className="flex items-center gap-2">
                          <div className="h-4 bg-muted rounded-lg w-20 animate-pulse"></div>
                          <div className="h-4 bg-muted rounded-lg w-24 animate-pulse"></div>
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <div className="h-4 bg-muted rounded-lg w-16 animate-pulse"></div>
                          <div className="h-4 bg-muted rounded-lg w-20 animate-pulse"></div>
                          <div className="h-6 bg-muted rounded-full w-16 animate-pulse"></div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-6 bg-muted rounded-lg w-20 animate-pulse"></div>
                        <div className="h-2 bg-muted rounded-full w-24 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar Skeleton */}
          <div className="space-y-6">
            {/* Trending at School Skeleton */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="h-6 bg-muted rounded-lg w-32 mb-4 animate-pulse"></div>
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 pb-3 border-b border-border last:border-0"
                  >
                    <div className="h-8 w-8 bg-muted rounded-full animate-pulse"></div>
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-muted rounded-lg w-full animate-pulse"></div>
                      <div className="h-3 bg-muted rounded-lg w-2/3 animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity Skeleton */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="h-6 bg-muted rounded-lg w-32 mb-4 animate-pulse"></div>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 pb-3 border-b border-border last:border-0"
                  >
                    <div className="h-8 w-8 bg-muted rounded-full animate-pulse mt-1"></div>
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-muted rounded-lg w-full animate-pulse"></div>
                      <div className="h-3 bg-muted rounded-lg w-3/4 animate-pulse"></div>
                      <div className="h-3 bg-muted rounded-lg w-20 animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function Dashboard() {
  const userQuery = useQuery({
    queryKey: ["apiUser"],
    queryFn: async () => {
      const result = await getUserById({
        input: { id: "8eebb180-33a8-47d8-90e8-74b794694c18", includeStats: true },
        fields: [
          "id",
          "email",
          "firstName",
          "lastName",
          "numPetitions",
          "numSigned",
          "totalPetitionSignatures",
          {
            petitions: [
              "id",
              "title",
              "description",
              "status",
              "trending",
              "signaturesCount",
              "goal",
              "daysLeft",
              // "insertedAt",
              { category: ["id", "name", "color"] },
              { user: ["firstName", "lastName"] },
            ],
          },
          {
            signatures: [
              "id",
              // "insertedAt",
              {
                petition: [
                  "id",
                  "title",
                  "signaturesCount",
                  "goal",
                  { category: ["name", "color"] },
                  { user: ["firstName", "lastName"] },
                ],
              },
              { user: ["firstName", "lastName"] },
            ],
          },
        ],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        result.errors.forEach((error) => {
          console.error("API Error:", error.message, error.fields, error.type)
        })
        throw new Error(`Failed to fetch user: ${result.errors.map((e) => e.message).join(", ")}`)
      }

      const fetchedUser: User = result.data
      return fetchedUser
    },
  })

  const apiUser = userQuery.data

  switch (true) {
    case userQuery.isError:
      return <div>Error: {userQuery.error?.message}</div>
    case userQuery.isPending:
      return <DashboardLoadingState />
    case userQuery.isSuccess:
      break
    default:
      return <div>Unknown status: {userQuery.status}</div>
  }

  // Use real user data from API
  const user = {
    name:
      apiUser.firstName && apiUser.lastName
        ? `${apiUser.firstName} ${apiUser.lastName}`
        : apiUser.email?.split("@")[0] || "User",
    school: "UC Berkeley", // TODO: Get from user organization when available
    role: "Student", // TODO: Get from user role when available
    joinedDate: "January 2024", // TODO: Get from user.created_at when available
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
          numSupporters={apiUser.totalPetitionSignatures}
        />

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 mt-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <UserPetitions petitions={apiUser.petitions} />
            <SignedPetitions signedPetitions={apiUser.signatures} />
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

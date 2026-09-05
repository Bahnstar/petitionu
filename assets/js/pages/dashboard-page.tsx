import { AuthLink } from "../components/auth-link"
import { Plus } from "lucide-react"
import { DashboardStats } from "../features/dashboard/dashboard-stats"
import { UserPetitions } from "../features/dashboard/user-petitions"
import { SignedPetitions } from "../features/dashboard/signed-petitions"
import { CampusIdeas } from "../features/dashboard/trending-at-school"
import { RecentActivity } from "../features/dashboard/recent-activity"
import { MyClassrooms } from "../features/classroom/my-classrooms"
import { Button } from "@/components/ui/button"
import { buildCSRFHeaders, getUserById, UserResourceSchema } from "../ash_rpc"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CleanResource } from "@/lib/types"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

type User = CleanResource<UserResourceSchema>

function DashboardLoadingState() {
  return (
    <main id="dashboard-loading" className="app-page" aria-busy="true" aria-label="Loading your dashboard">
      <p role="status" className="sr-only">Loading your dashboard…</p>
      <div aria-hidden="true" className="space-y-8 motion-safe:animate-pulse">
        <div className="h-14 w-3/4 max-w-md rounded-2xl bg-muted" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((index) => <div key={index} className="h-28 rounded-2xl bg-muted" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-80 rounded-2xl bg-muted lg:col-span-2" />
          <div className="h-64 rounded-2xl bg-muted" />
        </div>
      </div>
    </main>
  )
}

export default function Dashboard() {
  useDocumentTitle("Dashboard")
  const { user: currentUser, isLoading: authLoading, isAuthenticated } = useAuth()

  const userQuery = useQuery({
    queryKey: ["dashboardUser", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) {
        throw new Error("No authenticated user")
      }

      const result = await getUserById({
        input: { id: currentUser.id, includeStats: true },
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
              "deadline",
              "insertedAt",
              { category: ["id", "name", "color"] },
              "author",
            ],
          },
          {
            signatures: [
              "id",
              "insertedAt",
              {
                petition: [
                  "id",
                  "title",
                  "signaturesCount",
                  "goal",
                  "isAnonymous",
                  { category: ["name", "color"] },
                  "author",
                ],
              },
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
    enabled: !!currentUser?.id,
  })

  const apiUser = userQuery.data

  if (authLoading) return <DashboardLoadingState />

  if (!isAuthenticated || !currentUser) {
    return (
      <main className="app-page">
        <div className="app-empty-state">
          <h1 className="app-page-heading">Your next chapter starts here.</h1>
          <p className="app-page-description">Sign in to see your petitions, the ideas you support, and your classrooms.</p>
          <Button asChild className="mt-6"><AuthLink>Sign in</AuthLink></Button>
        </div>
      </main>
    )
  }

  if (userQuery.isPending) return <DashboardLoadingState />

  if (userQuery.isError || !apiUser) {
    return (
      <main className="app-page">
        <section id="dashboard-error" className="app-empty-state" role="alert">
          <h1 className="app-page-heading">Your dashboard couldn’t load.</h1>
          <p className="app-page-description">Try again to get your latest petitions and signatures.</p>
          <Button id="dashboard-retry" className="mt-6" onClick={() => userQuery.refetch()} disabled={userQuery.isFetching}>
            {userQuery.isFetching ? "Trying again…" : "Try again"}
          </Button>
        </section>
      </main>
    )
  }

  const name = apiUser.firstName || apiUser.email?.split("@")[0] || "friend"

  return (
    <main id="dashboard-page" className="app-page">
      <header className="mb-9 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="app-page-heading break-words">Welcome back, {name}.</h1>
          <p className="app-page-description">Your ideas, your people, and the change you’re making together.</p>
        </div>
        <Button asChild className="shrink-0"><Link id="dashboard-create-petition" to={ROUTES.createPetition}><Plus aria-hidden="true" />Start a petition</Link></Button>
      </header>

      {!currentUser.emailVerified || !currentUser.profileComplete ? <p className="mb-6 rounded-xl bg-secondary p-4 text-sm">Confirm your email and complete your campus profile to publish, sign, or comment. <Link to="/ash-typescript/profile" className="font-medium underline underline-offset-4">Complete your profile</Link></p> : null}

      <DashboardStats numPetitions={apiUser.numPetitions} numSigned={apiUser.numSigned} numSupporters={apiUser.totalPetitionSignatures} />

      <div className="mt-9 grid items-start gap-7 lg:grid-cols-3">
        <div className="min-w-0 space-y-7 lg:col-span-2">
          <UserPetitions petitions={apiUser.petitions ?? []} />
          <SignedPetitions signedPetitions={apiUser.signatures ?? []} />
        </div>
        <aside className="min-w-0 space-y-7" aria-label="Your community">
          <MyClassrooms currentUserId={apiUser.id} />
          <CampusIdeas />
          <RecentActivity petitions={apiUser.petitions ?? []} signatures={apiUser.signatures ?? []} />
        </aside>
      </div>
    </main>
  )
}

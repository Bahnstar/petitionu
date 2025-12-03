import { User, Calendar, TrendingUp, Share2, Flag, CheckCircle2, Clock } from "lucide-react"
import { useParams } from "react-router-dom"
import { buildCSRFHeaders, getPetitions, getUsers, PetitionResourceSchema } from "../ash_rpc"
import { CleanResource } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useQuery } from "@tanstack/react-query"

type Petition = CleanResource<PetitionResourceSchema>
// type Petition = InferGetPetitionsResult<>

export default function PetitionIndexPage() {
  const { id } = useParams()

  async function getAuthToken(): Promise<string> {
    // Get token from storage, refresh if needed
    // const token = localStorage.getItem("authToken")
    const token = localStorage.getItem("_petitionu_key")
    if (!token) {
      throw new Error("Not authenticated")
    }
    return token
  }

  const authenticatedFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAuthToken()

    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    })
  }

  const {
    status,
    data: petition,
    error,
  } = useQuery({
    queryKey: ["petition", id],
    queryFn: async () => {
      const result = await getPetitions({
        fields: [
          "id",
          "title",
          "description",
          "status",
          "goal",
          "signaturesCount",
          "daysLeft",
          "trending",
          "author",
          "categoryId",
          "allowComments",
          "isAnonymous",
          "deadline",
          // { user: ["firstName", "lastName", "email"] },
          { category: ["id", "name", "description"] },
          { comments: ["sentiment", "text"] },
          { signatures: ["reason", "userAgent"] },
          { updates: ["id", "title", "body"] },
        ],
        filter: { id: { eq: id } },
        headers: buildCSRFHeaders(),
        // customFetch: authenticatedFetch,
      })

      if (!result.success) {
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch petitions")
      }

      const fetchedPetition: Petition = result.data[0]
      return fetchedPetition
    },
  })

  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const result = await getUsers({
        fields: ["firstName", "lastName", "email"],
        // filter: { id: { eq: 1 } },
        headers: buildCSRFHeaders(),
      })

      if (!result.success) {
        // @ts-ignore
        result.errors.forEach((error) => {
          console.log(error.message, error.field, error.code)
        })
        throw new Error("Failed to fetch user")
      }

      const fetchedUser = result.data[0]
      return fetchedUser
    },
  })

  switch (status) {
    case "pending":
      return <div>Loading...</div>
    case "error":
      return <div>Error: {error.message}</div>
    case "success":
    default:
      break
  }

  const progress = (petition.signaturesCount / petition.goal) * 100

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <div className="text-sm text-muted-foreground mb-6">
          <a href="/" className="hover:text-foreground transition-colors">
            Home
          </a>
          <span className="mx-2">/</span>
          <span className="text-foreground">Petition</span>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                  {petition.category.name ?? "General"}
                </span>
                {petition.trending && (
                  <div className="flex items-center gap-1 text-primary">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">Trending</span>
                  </div>
                )}
              </div>

              <h1 className="text-4xl font-bold text-foreground mb-4 text-balance leading-tight">
                {petition.title}
              </h1>

              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <div>
                    <span className="font-medium text-foreground">{petition.author}</span>
                    <span className="mx-1">•</span>
                    {/*<span>{petition.authorRole}</span>*/}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Started {new Date(petition.deadline).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="prose prose-sm max-w-none">
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="whitespace-pre-line text-foreground leading-relaxed">
                  {petition.description}
                </div>
              </div>
            </div>

            {/* Updates */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4">Updates</h2>
              <div className="space-y-4">
                {petition.updates.map((update, index) => (
                  <div key={index} className="bg-card border border-border rounded-lg p-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{update.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{update.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Signatures */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4">Recent Signatures</h2>
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                {petition.signatures
                  .filter((_, index) => index < 5)
                  .map((signature, index) => (
                    <div key={index} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-foreground">{signature.userAgent}</p>
                          {signature.reason && (
                            <p className="text-sm text-muted-foreground mt-1 italic">
                              "{signature.reason}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {/*<span>{signature.time}</span>*/}
                          <span>{new Date().toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Comments Section */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Comments ({petition.comments.length})
              </h2>

              {/* Comment Form */}
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Leave a Comment</h3>
                <form className="space-y-4">
                  <div>
                    <Textarea
                      placeholder="Share your thoughts on this petition..."
                      rows={4}
                      className="resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Be respectful and constructive in your comments
                    </p>
                    <button type="submit">Post Comment</button>
                  </div>
                </form>
              </div>

              {/* Comments List */}
              <div className="space-y-4">
                {petition.comments.map((comment) => (
                  <div key={comment.id} className="bg-card border border-border rounded-lg p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">
                            Anon User
                            {/*{`${comment.user.firstName} ${comment.user.lastName}`}*/}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{"Student"}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {/*<span>{comment.time}</span>*/}
                        </div>
                      </div>
                    </div>
                    <p className="text-foreground leading-relaxed mb-4">{comment.text}</p>
                    <div className="flex items-center gap-4">
                      <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                          />
                        </svg>
                        {/*<span>{comment.likes}</span>*/}
                      </button>
                      <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Reply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              {/* Sign Card */}
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-3xl font-bold text-foreground">
                      {petition.signatures.length}
                    </span>
                    <span className="text-muted-foreground">{petition.daysLeft} days left</span>
                  </div>

                  <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{Math.round(progress)}%</span>{" "}
                    of {petition.goal.toLocaleString()} goal
                  </div>
                </div>

                <form className="space-y-4">
                  <div>
                    <label htmlFor="name" className="text-sm font-medium">
                      Full Name
                    </label>
                    <Input id="name" type="text" placeholder="Enter your name" className="mt-1" />
                  </div>

                  <div>
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@university.edu"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label htmlFor="comment" className="text-sm font-medium">
                      Comment (Optional)
                    </label>
                    <Textarea
                      id="comment"
                      placeholder="Why are you signing this petition?"
                      rows={3}
                      className="mt-1"
                    />
                  </div>

                  <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    Sign This Petition
                  </button>

                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    By signing, you agree to receive updates about this petition
                  </p>
                </form>
              </div>

              {/* Share & Report */}
              <div className="flex gap-3">
                <button className="flex-1">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </button>
                <button>
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

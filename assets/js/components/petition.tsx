import { User, Calendar, TrendingUp, Share2, Flag, CheckCircle2, Clock } from "lucide-react"
import { useParams } from "react-router-dom"
import { buildCSRFHeaders, getPetitionById, listPetitions, SuccessDataFunc } from "../ash_rpc"
import { useEffect, useState } from "react"

// Mock data - in a real app, this would fetch based on the id
const getPetition = (id: string) => ({
  id: parseInt(id),
  title: "Extend Library Hours During Finals Week",
  description: `As students, we need more access to quiet study spaces and academic resources during the most crucial time of the semester. The current library hours of 8 AM to 10 PM are insufficient during finals week when students need around-the-clock access to study materials and collaborative spaces.

Many students have reported having to leave the library late at night when they are in the middle of productive study sessions. This disruption affects their academic performance and adds unnecessary stress during an already challenging time.

We propose extending library hours to 24/7 operation during the two weeks of final examinations each semester. This change would:
• Provide students with flexible study options that fit their schedules
• Reduce crowding during peak hours by distributing students across more time slots
• Support students who work part-time jobs and can only study late at night
• Demonstrate the university's commitment to student academic success

Other peer institutions have successfully implemented extended library hours during finals with overwhelmingly positive feedback from their student bodies. We believe our university should follow suit and invest in student success.`,
  author: "Sarah Chen",
  authorRole: "Senior, Political Science",
  category: "Campus Facilities",
  signatures: 2847,
  goal: 5000,
  daysLeft: 12,
  trending: true,
  createdAt: "2024-01-15",
  updates: [
    {
      date: "2024-01-20",
      title: "Meeting with Administration",
      content:
        "Met with the Dean of Students who expressed support for the initiative. Next steps include budget review.",
    },
    {
      date: "2024-01-18",
      title: "Reached 2,000 Signatures!",
      content: "Thank you all for your incredible support. We're halfway to our goal!",
    },
  ],
  recentSignatures: [
    { name: "Alex Johnson", time: "2 minutes ago", comment: "This would help so much!" },
    {
      name: "Maria Garcia",
      time: "15 minutes ago",
      comment: "Absolutely necessary for student success.",
    },
    { name: "David Kim", time: "1 hour ago", comment: "Been waiting for this change for years." },
    { name: "Emily Brown", time: "2 hours ago", comment: "Full support!" },
  ],
  comments: [
    {
      id: 1,
      author: "Michael Torres",
      role: "Junior, Engineering",
      content:
        "This is such an important initiative. As an engineering student, I often find myself needing to work on projects late into the night with my study group. Having 24/7 library access during finals would be a game-changer for us.",
      time: "3 hours ago",
      likes: 42,
    },
    {
      id: 2,
      author: "Jessica Liu",
      role: "Sophomore, Pre-Med",
      content:
        "I completely support this. The library gets so crowded during the day that it's hard to find a quiet spot. Extended hours would really help distribute the crowd.",
      time: "5 hours ago",
      likes: 28,
    },
    {
      id: 3,
      author: "Ryan Patel",
      role: "Senior, Business",
      content:
        "My previous university had this and it made such a difference. Really hope the administration listens to us on this one.",
      time: "1 day ago",
      likes: 15,
    },
    {
      id: 4,
      author: "Amanda Wright",
      role: "Graduate Student, Psychology",
      content:
        "Not just for undergrads - grad students would benefit tremendously from this as well. We often have conflicting schedules and late-night access would be incredibly helpful.",
      time: "1 day ago",
      likes: 31,
    },
  ],
})

export default function PetitionIndexPage() {
  const [petition, setPetition] = useState<Partial<SuccessDataFunc<typeof getPetitionById>>>()
  const { id } = useParams()
  useEffect(() => {
    const fetchPetition = async () => {
      //   const result = await getPetitionById({
      //     fields: [
      //       "id",
      //       "title",
      //       "description",
      //       "status",
      //       "goal",
      //       "daysLeft",
      //       "signatureCount",
      //       "author",
      //       "allowComments",
      //       "deadline",
      //       "isAnonymous",
      //       "signatureCount",
      //     ],
      //     fetchOptions: { id },
      //   })
      //   if (result.success) {
      //     setPetition(result.data as SuccessDataFunc<typeof getPetitionById>)
      //   }
      // }
      const result = await listPetitions({
        fields: [
          "id",
          "title",
          "description",
          "status",
          "goal",
          "daysLeft",
          "author",
          "allowComments",
          "deadline",
          "isAnonymous",
          "signaturesCount",
          "userId",
          "categoryId",
          {
            category: ["id", "name", "description", "color"],
            comments: ["id", "sentiment", "text"],
            signatures: ["id", "reason"],
          },
        ],
        input: { id: id },
        headers: buildCSRFHeaders(),
      })
      if (result.success) {
        console.log(result.data)
        setPetition(result.data[0])
      }
    }
    fetchPetition()
  }, [])

  if (!petition) {
    return <div>Loading...</div>
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
                  {petition.category.name ? petition.category.name : "General"}
                </span>
                {/*{petition.trending && (
                  <div className="flex items-center gap-1 text-primary">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">Trending</span>
                  </div>
                )}*/}
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
                {/*{petition.updates.map((update, index) => (
                  <div key={index} className="bg-card border border-border rounded-lg p-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span>{new Date(update.date).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{update.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{update.content}</p>
                  </div>*/}
                {/*))}*/}
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
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Comments Section */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4">
                {/*Comments ({petition.comments.length})*/}
              </h2>

              {/* Comment Form */}
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Leave a Comment</h3>
                <form className="space-y-4">
                  <div>
                    <textarea
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
                          {/*<span className="font-semibold text-foreground">{comment.author}</span>*/}
                          <span className="text-xs text-muted-foreground">•</span>
                          {/*<span className="text-xs text-muted-foreground">{comment.role}</span>*/}
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
                      {/*{petition.signatures.toLocaleString()}*/}
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
                    <input id="name" type="text" placeholder="Enter your name" className="mt-1" />
                  </div>

                  <div>
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <input
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
                    <textarea
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

      {/*<Footer />*/}
    </main>
  )
}

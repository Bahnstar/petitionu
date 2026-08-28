import { PetitionCard } from "./petition-card"
import { PetitionResourceSchema } from "../../ash_rpc"
import { CleanResource } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"

// Fallback mock data for when no petitions are available
const mockPetitions: CleanResource<PetitionResourceSchema>[] = [
  {
    id: "018f1234-5678-9abc-def0-123456789abc",
    title: "Extend Library Hours During Finals Week",
    description: "Request 24/7 library access during final exams to support student study needs and reduce stress during most critical academic period.",
    author: "Sarah Mitchell",
    signaturesCount: 2847,
    goal: 3000,
    daysLeft: 12,
    trending: true,
    status: "open",
    deadline: null,
    allowComments: true,
    isAnonymous: false,
    insertedAt: "2024-01-15T10:30:00Z",
    updatedAt: "2024-01-15T10:30:00Z",
    userId: "018f1234-5678-9abc-def0-123456789abc",
    categoryId: "018f1234-5678-9abc-def0-123456789abc",
    category: {
      id: "018f1234-5678-9abc-def0-123456789abc",
      name: "Academic",
      description: "Academic related petitions",
      color: "#3b82f6",
      insertedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    },
    user: {
      id: "018f1234-5678-9abc-def0-123456789abc",
      firstName: "Sarah",
      lastName: "Mitchell",
      email: "sarah.mitchell@example.com",
      graduationYear: 2025,
      insertedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      numPetitions: 2,
      numSigned: 15,
      numPetitionSignees: 50,
      totalPetitionSignatures: 120,
      petitions: [],
      signatures: []
    },
    updates: [],
    comments: [],
    signatures: []
  },
  {
    id: "018f1234-5678-9abc-def0-123456789abd",
    title: "Add More Vegetarian Options in Dining Halls",
    description: "Expand plant-based meal choices across all campus dining facilities to accommodate dietary preferences and promote sustainable eating.",
    author: "James Chen",
    signaturesCount: 1653,
    goal: 2500,
    daysLeft: 8,
    trending: false,
    status: "open",
    deadline: null,
    allowComments: true,
    isAnonymous: false,
    insertedAt: "2024-01-14T09:15:00Z",
    updatedAt: "2024-01-14T09:15:00Z",
    userId: "018f1234-5678-9abc-def0-123456789abd",
    categoryId: "018f1234-5678-9abc-def0-123456789abd",
    category: {
      id: "018f1234-5678-9abc-def0-123456789abd",
      name: "Campus Life",
      description: "Campus life related petitions",
      color: "#10b981",
      insertedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    },
    user: {
      id: "018f1234-5678-9abc-def0-123456789abd",
      firstName: "James",
      lastName: "Chen",
      email: "james.chen@example.com",
      graduationYear: 2024,
      insertedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      numPetitions: 1,
      numSigned: 8,
      numPetitionSignees: 25,
      totalPetitionSignatures: 60,
      petitions: [],
      signatures: []
    },
    updates: [],
    comments: [],
    signatures: []
  }
]

interface PetitionGridProps {
  petitions?: CleanResource<PetitionResourceSchema>[]
}

export function PetitionGrid({ petitions = mockPetitions }: PetitionGridProps) {
  return (
    <section id="petitions" className="py-16 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8 lg:mb-12">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-2">
              Active Petitions
            </h2>
            <p className="text-muted-foreground">Discover causes that matter to your community</p>
          </div>

          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground">
              Trending
            </button>
            <button className="px-4 py-2 text-sm rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80">
              Recent
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {petitions.length > 0 ? (
            petitions.map((petition) => (
              <PetitionCard key={petition.id} petition={petition} />
            ))
          ) : (
            <div className="col-span-full text-center py-16">
              <p className="text-muted-foreground text-lg">
                No petitions found. Be the first to start a petition!
              </p>
              <Button className="mt-4" asChild>
                <a href={ROUTES.createPetition}>Start a Petition</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

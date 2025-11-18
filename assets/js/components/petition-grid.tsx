import { PetitionCard } from "./petition-card"

const petitions = [
  {
    id: 1,
    title: "Extend Library Hours During Finals Week",
    description:
      "Request 24/7 library access during final exams to support student study needs and reduce stress during the most critical academic period.",
    author: "Sarah Mitchell",
    category: "Academic",
    signatures: 2847,
    goal: 3000,
    daysLeft: 12,
    trending: true,
  },
  {
    id: 2,
    title: "Add More Vegetarian Options in Dining Halls",
    description:
      "Expand plant-based meal choices across all campus dining facilities to accommodate dietary preferences and promote sustainable eating.",
    author: "James Chen",
    category: "Campus Life",
    signatures: 1653,
    goal: 2500,
    daysLeft: 8,
    trending: false,
  },
  {
    id: 3,
    title: "Improve Mental Health Services Access",
    description:
      "Reduce wait times and increase counseling staff to ensure all students can access mental health support when needed.",
    author: "Emma Rodriguez",
    category: "Student Wellness",
    signatures: 4129,
    goal: 5000,
    daysLeft: 15,
    trending: true,
  },
  {
    id: 4,
    title: "Create Gender-Neutral Bathrooms Campus-Wide",
    description:
      "Install inclusive restroom facilities in all major buildings to support students of all gender identities.",
    author: "Alex Thompson",
    category: "Inclusion",
    signatures: 892,
    goal: 1500,
    daysLeft: 21,
    trending: false,
  },
  {
    id: 5,
    title: "Reduce Student Parking Permit Costs",
    description:
      "Lower annual parking fees to make campus parking more affordable for students, especially those commuting.",
    author: "Michael Park",
    category: "Finance",
    signatures: 3241,
    goal: 4000,
    daysLeft: 6,
    trending: true,
  },
  {
    id: 6,
    title: "Implement Mandatory Sustainability Courses",
    description:
      "Add climate change and sustainability education as a graduation requirement for all undergraduate programs.",
    author: "Lisa Nguyen",
    category: "Academic",
    signatures: 1567,
    goal: 2000,
    daysLeft: 18,
    trending: false,
  },
]

export function PetitionGrid() {
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
          {petitions.map((petition) => (
            <PetitionCard key={petition.id} petition={petition} />
          ))}
        </div>
      </div>
    </section>
  )
}

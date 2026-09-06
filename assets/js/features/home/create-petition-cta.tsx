import { CheckCircle2 } from "lucide-react"

export function CreatePetitionCTA() {
  const steps = [
    "Write your petition and set a signature goal",
    "Share with your community and gather support",
    "Track progress and engage with supporters",
    "Present results to university administration",
  ]

  return (
    <section className="bg-muted/30 py-16 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-3xl font-bold text-balance text-foreground lg:text-5xl">
            Ready to drive change on campus?
          </h2>
          <p className="mb-12 text-lg leading-relaxed text-pretty text-muted-foreground">
            Starting a petition is simple. Follow these steps to make your voice heard and create
            meaningful impact.
          </p>

          <div className="mb-12 grid gap-6 text-left sm:grid-cols-2">
            {steps.map((step, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="mb-1 font-semibold text-foreground">Step {index + 1}</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90">
            Create Your Petition
          </button>
        </div>
      </div>
    </section>
  )
}

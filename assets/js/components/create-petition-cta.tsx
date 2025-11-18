import { CheckCircle2 } from "lucide-react"

export function CreatePetitionCTA() {
  const steps = [
    "Write your petition and set a signature goal",
    "Share with your community and gather support",
    "Track progress and engage with supporters",
    "Present results to university administration",
  ]

  return (
    <section className="py-16 lg:py-24 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-foreground mb-6 text-balance">
            Ready to drive change on campus?
          </h2>
          <p className="text-lg text-muted-foreground mb-12 text-pretty leading-relaxed">
            Starting a petition is simple. Follow these steps to make your voice heard and create
            meaningful impact.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-12 text-left">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground mb-1">Step {index + 1}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="bg-primary text-primary-foreground hover:bg-primary/90 p-2 rounded-md">
            Create Your Petition
          </button>
        </div>
      </div>
    </section>
  )
}

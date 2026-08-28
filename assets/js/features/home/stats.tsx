import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { buildCSRFHeaders, getPetitions } from "../../ash_rpc"

export function Stats() {
  const statsQuery = useQuery({
    queryKey: ["statsAggregates"],
    queryFn: async () => {
      const result = await getPetitions({
        fields: ["id", "status", "signaturesCount"],
        headers: buildCSRFHeaders(),
      })
      if (result.success === false) throw new Error(result.errors.map((e) => e.message).join(", "))
      const petitions = result.data as { status: string; signaturesCount: number | null }[]
      const active = petitions.filter((p) => p.status === "open").length
      const totalSigs = petitions.reduce((sum, p) => sum + (p.signaturesCount ?? 0), 0)
      const victories = petitions.filter((p) => p.status === "victory").length
      return {
        active,
        totalSigs,
        victories,
        participants: totalSigs,
        count: petitions.length,
      }
    },
    staleTime: 60_000,
  })

  const data = statsQuery.data

  const stats = [
    { label: "Active Petitions", value: data?.active ?? 0, suffix: "" },
    { label: "Total Signatures", value: data?.totalSigs ?? 0, suffix: "" },
    { label: "Successful Changes", value: data?.victories ?? 0, suffix: "" },
    { label: "Student Participants", value: data?.participants ?? 0, suffix: "" },
  ]

  return (
    <section className="py-12 lg:py-16 bg-gradient-to-b from-muted/30 to-background border-y border-border/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="text-center animate-in fade-in slide-in-from-bottom-3 duration-700"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="text-3xl lg:text-5xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text mb-2">
                <AnimatedCounter value={stat.value} />
              </div>
              <div className="text-sm lg:text-base text-muted-foreground font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AnimatedCounter({ value }: { value: number }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const duration = 2000
    const steps = 60
    const increment = value / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return <>{count.toLocaleString()}</>
}

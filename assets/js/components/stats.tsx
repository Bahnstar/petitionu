import { useEffect, useState } from "react"

export function Stats() {
  const stats = [
    { label: "Active Petitions", value: 127, suffix: "" },
    { label: "Total Signatures", value: 24853, suffix: "" },
    { label: "Successful Changes", value: 43, suffix: "" },
    { label: "Student Participants", value: 8492, suffix: "" },
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

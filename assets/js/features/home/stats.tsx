import { useEffect, useState } from "react"

export function Stats() {
  const stats = [
    { label: "Active Petitions", value: 127, suffix: "" },
    { label: "Total Signatures", value: 24853, suffix: "" },
    { label: "Successful Changes", value: 43, suffix: "" },
    { label: "Student Participants", value: 8492, suffix: "" },
  ]

  return (
    <section className="border-y border-border/40 bg-gradient-to-b from-muted/30 to-background py-12 lg:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-12">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="animate-in text-center duration-700 fade-in slide-in-from-bottom-3"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="mb-2 bg-gradient-to-br from-primary to-accent bg-clip-text text-3xl font-bold lg:text-5xl">
                <AnimatedCounter value={stat.value} />
              </div>
              <div className="text-sm font-medium text-muted-foreground lg:text-base">
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

interface DashboardStatsProps {
  numPetitions: number
  numSigned: number
  numSupporters: number
}

export function DashboardStats({ numPetitions, numSigned, numSupporters }: DashboardStatsProps) {
  const stats = [
    { label: "Petitions started", value: numPetitions, description: "Ideas you’ve put into words" },
    { label: "Petitions signed", value: numSigned, description: "Ideas you’ve stood behind" },
    { label: "Signatures gathered", value: numSupporters, description: "Across the petitions you started" },
  ]

  return (
    <dl id="dashboard-stats" className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {stats.map((stat) => (
        <div key={stat.label} className="py-6 sm:px-6 sm:first:pl-0">
          <dt className="text-sm text-muted-foreground">{stat.label}</dt>
          <dd className="mt-2 font-display text-5xl leading-none tracking-tight text-foreground">{(stat.value ?? 0).toLocaleString()}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">{stat.description}</dd>
        </div>
      ))}
    </dl>
  )
}

interface DashboardStatsProps {
  numPetitions: number
  numSigned: number
  numSupporters: number
}

export function DashboardStats({ numPetitions, numSigned, numSupporters }: DashboardStatsProps) {
  const stats = [
    { label: "Petitions started", value: numPetitions },
    { label: "Petitions signed", value: numSigned },
    { label: "Signatures on your petitions", value: numSupporters },
  ]

  return (
    <dl
      id="dashboard-stats"
      className="grid grid-cols-3 divide-x divide-border border-y border-border"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="px-3 py-4 first:pl-0 sm:px-6 sm:py-5">
          <dd className="font-display text-3xl leading-none tracking-tight text-foreground sm:text-5xl">
            {(stat.value ?? 0).toLocaleString()}
          </dd>
          <dt className="mt-2 text-xs text-muted-foreground sm:text-sm">{stat.label}</dt>
        </div>
      ))}
    </dl>
  )
}

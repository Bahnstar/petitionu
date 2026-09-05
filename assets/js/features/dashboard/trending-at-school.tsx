import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"

export function CampusIdeas() {
  return (
    <section id="dashboard-explore" className="rounded-2xl border border-[#eadcc7] bg-[#f7e8d2] p-6 text-[#685649]">
      <h2 className="font-display text-3xl leading-tight tracking-tight">Find your people.</h2>
      <p className="mt-3 text-sm leading-relaxed">See what other students want to change. Your signature could help their idea take its next step.</p>
      <Button asChild variant="outline" className="mt-5 border-[#685649]/25 bg-transparent text-[#685649] hover:bg-white/40 hover:text-[#685649]"><Link to={ROUTES.petitions}>Explore petitions</Link></Button>
    </section>
  )
}

import { Link } from "react-router-dom"
import { ROUTES } from "@/lib/routes"

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Link to={ROUTES.home} className="app-brand text-[25px]">PetitionU</Link>
          <p className="text-xs text-muted-foreground">A place for student voices.</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
          <Link to={ROUTES.petitions} className="py-2 hover:underline underline-offset-4">Browse petitions</Link>
          <Link to={ROUTES.classrooms} className="py-2 hover:underline underline-offset-4">Classrooms</Link>
          <Link to={ROUTES.support} className="py-2 hover:underline underline-offset-4">Support</Link>
          <Link to={ROUTES.privacy} className="py-2 hover:underline underline-offset-4">Privacy</Link>
          <Link to={ROUTES.communityRules} className="py-2 hover:underline underline-offset-4">Community rules</Link>
        </nav>
      </div>
    </footer>
  )
}

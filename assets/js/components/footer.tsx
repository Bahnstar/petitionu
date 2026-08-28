import { GraduationCap } from "lucide-react"
import { Link } from "react-router-dom"
import { ROUTES } from "@/lib/routes"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to={ROUTES.home} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">PetitionU</span>
          </Link>

          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to={ROUTES.petitions} className="hover:text-foreground transition-colors">
              Browse Petitions
            </Link>
            <Link to={ROUTES.dashboard} className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link to={ROUTES.classrooms} className="hover:text-foreground transition-colors">
              Classrooms
            </Link>
          </nav>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} PetitionU
          </p>
        </div>
      </div>
    </footer>
  )
}

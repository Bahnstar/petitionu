import { GraduationCap, User } from "lucide-react"

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 lg:w-10 lg:h-10 bg-primary rounded-full flex items-center justify-center">
              {/*<PenLine className="w-4 h-4 lg:w-5 lg:h-5 text-primary-foreground" />*/}
              <GraduationCap className="w-4 h-4 lg:w-5 lg:h-5 text-primary-foreground" />
            </div>
            <span className="text-lg lg:text-xl font-semibold text-foreground">PetitionU</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#petitions"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Petitions
            </a>
            <a
              href="#about"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </a>
            <a
              href="#impact"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Our Impact
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button className="text-muted-foreground">
              <User className="w-5 h-5" />
            </button>
            <button className="bg-primary text-primary-foreground hover:bg-primary/90 p-2 rounded-md">
              <span className="hidden sm:inline">Start a Petition</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

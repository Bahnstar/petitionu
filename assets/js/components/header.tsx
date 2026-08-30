import { useEffect, useRef, useState } from "react"
import { GraduationCap, LogOut, Menu, User, X } from "lucide-react"
import { Link, NavLink } from "react-router-dom"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-sm transition-colors",
    isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
  )

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(navLinkClass({ isActive }), "block py-2 px-3 rounded-md text-base")

export function Header() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileOpenRef = useRef(mobileOpen)

  useEffect(() => {
    mobileOpenRef.current = mobileOpen
  }, [mobileOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileOpenRef.current) setMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const closeMobile = () => setMobileOpen(false)
  const displayName = user?.firstName || user?.email

  const navItems = [
    { label: "Classrooms", to: ROUTES.classrooms },
    { label: "Browse Petitions", to: ROUTES.petitions },
    ...(isAuthenticated ? [{ label: "Dashboard", to: ROUTES.dashboard }] : []),
  ]

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link to={ROUTES.home}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-primary rounded-full flex items-center justify-center">
                <GraduationCap className="w-4 h-4 lg:w-5 lg:h-5 text-primary-foreground" />
              </div>
              <span className="text-lg lg:text-xl font-semibold text-foreground">PetitionU</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <Button asChild>
                <Link to={ROUTES.createPetition}>Start a Petition</Link>
              </Button>
            </div>

            {isAuthenticated && user ? (
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{displayName}</span>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <a href="/sign-out">
                    <LogOut />
                    Sign out
                  </a>
                </Button>
              </div>
            ) : !isLoading ? (
              <div className="hidden md:flex items-center gap-2">
                <Button asChild variant="ghost">
                  <Link to="/sign-in">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Register</Link>
                </Button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              className="md:hidden p-2 -mr-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-card/95 backdrop-blur-sm">
          <nav className="flex flex-col p-4 gap-1">
            {navItems.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobile}
                className={mobileNavLinkClass}
                autoFocus={index === 0}
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink to={ROUTES.createPetition} onClick={closeMobile} className={mobileNavLinkClass}>
              Start a Petition
            </NavLink>

            <div className="border-t border-border mt-2 pt-4">
              {isAuthenticated && user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                  </div>
                  <a
                    href="/sign-out"
                    onClick={closeMobile}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <LogOut />
                    Sign out
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild variant="outline">
                    <Link to="/sign-in" onClick={closeMobile}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/register" onClick={closeMobile}>
                      Register
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

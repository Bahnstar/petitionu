import { useEffect, useRef, useState } from "react"
import { LogOut, Menu, X } from "lucide-react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { Button } from "@/components/ui/button"

export function Header() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const mobileOpenRef = useRef(mobileOpen)

  useEffect(() => { mobileOpenRef.current = mobileOpen }, [mobileOpen])
  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileOpenRef.current) {
        setMobileOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const navItems = [
    { label: "Browse petitions", to: ROUTES.petitions },
    { label: "Classrooms", to: ROUTES.classrooms },
    ...(isAuthenticated ? [{ label: "Your dashboard", to: ROUTES.dashboard }] : []),
  ]

  return (
    <header id="app-header" className="app-header">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Link to={ROUTES.home} className="app-brand" aria-label="PetitionU home">
          PetitionU<span aria-hidden="true">✳</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden xl:flex items-center gap-1">
          {navItems.map((item) => <NavLink key={item.to} to={item.to} className="app-nav-link">{item.label}</NavLink>)}
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden xl:flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <Link to={ROUTES.dashboard} className="max-w-28 truncate text-sm text-muted-foreground" title={user.firstName || user.email}>{user.firstName || user.email}</Link>
                <Button asChild variant="ghost" size="sm"><a href="/sign-out"><LogOut aria-hidden="true" />Sign out</a></Button>
              </>
            ) : !isLoading ? <a href="/sign-in" className="app-nav-link">Sign in</a> : null}
          </div>
          <Button asChild className="hidden sm:inline-flex"><Link id="header-create-petition" to={ROUTES.createPetition}>Start a petition</Link></Button>
          <button
            id="navigation-toggle" ref={menuButton} type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen} aria-controls="mobile-menu"
            className="xl:hidden inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav id="mobile-menu" aria-label="Mobile navigation" className="xl:hidden mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {navItems.map((item) => <NavLink key={item.to} to={item.to} className="app-nav-link" onClick={() => setMobileOpen(false)}>{item.label}</NavLink>)}
          <NavLink to={ROUTES.createPetition} className="app-nav-link" onClick={() => setMobileOpen(false)}>Start a petition</NavLink>
          {!isLoading && <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            {isAuthenticated && user ? <><span className="min-w-0 truncate px-3 text-sm text-muted-foreground">{user.firstName || user.email}</span><a href="/sign-out" className="app-nav-link">Sign out</a></> : <><a href="/sign-in" className="app-nav-link">Sign in</a><Button asChild size="sm"><a href="/register">Create an account</a></Button></>}
          </div>}
        </nav>
      )}
    </header>
  )
}

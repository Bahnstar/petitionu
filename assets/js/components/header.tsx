import { AuthLink } from "./auth-link"
import { useEffect, useRef, useState } from "react"
import { LogOut, Menu, X } from "lucide-react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/auth-context"
import { ROUTES } from "@/lib/routes"
import { Button } from "@/components/ui/button"

export function Header({ landing = false }: { landing?: boolean }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { pathname } = useLocation()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const mobileOpen = menuPath === pathname
  if (menuPath !== null && menuPath !== pathname) setMenuPath(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const mobileOpenRef = useRef(mobileOpen)

  useEffect(() => {
    mobileOpenRef.current = mobileOpen
  }, [mobileOpen])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileOpenRef.current) {
        setMenuPath(null)
        menuButton.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const navItems: { label: string; to: string }[] = [
    { label: "Browse petitions", to: ROUTES.petitions },
  ]
  if (landing) {
    navItems.push(
      { label: "How it works", to: "#landing-how" },
      { label: "Why PetitionU", to: "#landing-why" },
    )
  } else {
    navItems.push({ label: "Classrooms", to: ROUTES.classrooms })
    if (isAuthenticated) navItems.push({ label: "Your profile", to: ROUTES.profile })
    if (user?.role === "admin" || user?.role === "superadmin")
      navItems.push({ label: "Moderation", to: ROUTES.moderation })
  }

  const navigation = navItems.map((item) =>
    item.to.startsWith("#") ? (
      <a key={item.to} href={item.to} className="site-nav-link" onClick={() => setMenuPath(null)}>
        {item.label}
      </a>
    ) : (
      <NavLink
        key={item.to}
        to={item.to}
        className="site-nav-link"
        id={landing && item.to === ROUTES.petitions ? "landing-header-browse" : undefined}
        onClick={() => setMenuPath(null)}
      >
        {item.label}
      </NavLink>
    ),
  )

  function renderAccountLinks() {
    if (isAuthenticated && user) {
      return (
        <>
          <Link
            id={landing ? "landing-header-account" : undefined}
            to={ROUTES.dashboard}
            title={user.firstName || user.email}
          >
            My dashboard
          </Link>
          <a href="/sign-out" className="site-sign-out">
            <LogOut aria-hidden="true" />
            Sign out
          </a>
        </>
      )
    }
    if (!isLoading)
      return <AuthLink id={landing ? "landing-header-account" : undefined}>Sign in</AuthLink>
    return null
  }

  return (
    <header id={landing ? "landing-header" : "app-header"} className="site-header">
      <div className="site-header-row">
        <Link to={ROUTES.home} className="site-brand" aria-label="PetitionU home">
          PetitionU<span aria-hidden="true">✳</span>
        </Link>
        <nav
          id="main-navigation"
          aria-label="Main navigation"
          className="site-navigation"
          data-open={mobileOpen}
        >
          {navigation}
        </nav>
        <div className="site-header-actions">
          <div className="site-header-account">{renderAccountLinks()}</div>
          <Button asChild className="site-header-cta">
            <Link
              id={landing ? "landing-header-create" : "header-create-petition"}
              to={ROUTES.createPetition}
            >
              Start a petition
            </Link>
          </Button>
          <button
            id="navigation-toggle"
            ref={menuButton}
            type="button"
            onClick={() => setMenuPath(mobileOpen ? null : pathname)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="main-navigation mobile-menu"
            className="site-menu-toggle"
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav id="mobile-menu" aria-label="Account navigation" className="site-mobile-account">
          <Link
            to={ROUTES.createPetition}
            className="site-nav-link"
            onClick={() => setMenuPath(null)}
          >
            Start a petition
          </Link>
          {!isLoading &&
            (isAuthenticated && user ? (
              <>
                <Link
                  to={ROUTES.dashboard}
                  className="site-nav-link"
                  onClick={() => setMenuPath(null)}
                >
                  My dashboard
                </Link>
                {landing && (
                  <Link
                    to={ROUTES.profile}
                    className="site-nav-link"
                    onClick={() => setMenuPath(null)}
                  >
                    Your profile
                  </Link>
                )}
                <a href="/sign-out" className="site-nav-link">
                  Sign out
                </a>
              </>
            ) : (
              <>
                <AuthLink className="site-nav-link">Sign in</AuthLink>
                <AuthLink page="/register" className="site-nav-link">
                  Create an account
                </AuthLink>
              </>
            ))}
        </nav>
      )}
    </header>
  )
}

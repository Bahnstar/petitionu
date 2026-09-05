import { useLocation } from "react-router-dom"
import { ROUTES } from "@/lib/routes"
import { Header } from "./header"
import { Footer } from "./footer"

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  if (pathname.replace(/\/$/, "") === ROUTES.home) {
    return <main>{children}</main>
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-skip-link">Skip to content</a>
      <Header />
      <div id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</div>
      <Footer />
    </div>
  )
}

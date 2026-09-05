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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-orange-50">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}

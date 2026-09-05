import { useLayoutEffect, useRef } from "react"
import { useLocation, useNavigationType } from "react-router-dom"
import { ROUTES } from "@/lib/routes"
import { Header } from "./header"
import { Footer } from "./footer"

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname, key, hash } = useLocation()
  const navigationType = useNavigationType()
  const previousKey = useRef(key)

  useLayoutEffect(() => {
    if (previousKey.current === key) return
    previousKey.current = key
    // Leave history traversal to the browser's native scroll restoration.
    if (navigationType === "POP") return

    let target: HTMLElement | null = null
    if (hash) {
      try { target = document.getElementById(decodeURIComponent(hash.slice(1))) } catch { /* Ignore malformed fragments. */ }
    }
    if (target) {
      target.setAttribute("tabindex", "-1")
      target.focus({ preventScroll: true })
      target.scrollIntoView({ behavior: "instant" })
    } else {
      document.getElementById("main-content")?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
    }
  }, [key, hash, navigationType])

  if (pathname.replace(/\/$/, "") === ROUTES.home) {
    return <main id="main-content" tabIndex={-1} className="focus:outline-none">{children}</main>
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

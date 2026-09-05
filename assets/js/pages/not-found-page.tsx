import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

export function NotFoundPage() {
  useDocumentTitle("Page not found")

  return (
    <main id="not-found-page" className="app-page flex min-h-[70vh] items-center justify-center">
      <div className="max-w-lg py-12 text-center">
        <p className="mb-6 font-display text-8xl tracking-tighter text-primary" aria-hidden="true">404</p>
        <h1 className="app-page-heading">A little off campus.</h1>
        <p className="app-page-description">We couldn’t find this page. The link may have changed, but there are still plenty of ideas to explore.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild><Link id="not-found-explore" to={ROUTES.petitions}>Explore petitions</Link></Button>
          <Button asChild variant="outline"><Link id="not-found-home" to={ROUTES.home}>Back to home</Link></Button>
        </div>
      </div>
    </main>
  )
}

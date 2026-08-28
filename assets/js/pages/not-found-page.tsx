import { Link } from "react-router-dom"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"

export function NotFoundPage() {
  useDocumentTitle("Not Found")

  return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <p className="text-6xl font-bold text-primary mb-4">404</p>
        <h1 className="text-2xl font-semibold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has moved.
        </p>
        <Link
          to={ROUTES.home}
          className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-md font-medium transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </main>
  )
}

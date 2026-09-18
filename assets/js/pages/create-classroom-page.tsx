import { AuthLink } from "../components/auth-link"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/routes"
import { useDocumentTitle } from "../hooks/use-document-title"
import { useAuth } from "../contexts/auth-context"
import { ClassroomForm } from "../features/classroom/classroom-form"

export default function CreateClassroomPage() {
  useDocumentTitle("New Classroom")

  const { user: currentUser, isLoading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <main className="app-page" aria-busy="true">
        <p role="status" className="app-page-description">
          Getting your classroom ready…
        </p>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="app-page">
        <section id="create-classroom-sign-in" className="app-empty-state">
          <h1 className="app-page-heading">Make room for your class.</h1>
          <p className="app-page-description">
            Sign in to create a classroom and invite your students to share their ideas.
          </p>
          <Button asChild className="mt-6">
            <AuthLink>Sign in</AuthLink>
          </Button>
        </section>
      </main>
    )
  }

  if (!currentUser.emailVerified || !currentUser.profileComplete) {
    return (
      <main className="app-page">
        <section className="app-empty-state">
          <h1 className="app-page-heading">Get ready to create your classroom.</h1>
          <p className="app-page-description">
            Confirm your email and complete your campus profile before creating a classroom.
          </p>
          <Button asChild className="mt-6">
            <Link to="/ash-typescript/profile">Complete your profile</Link>
          </Button>
        </section>
      </main>
    )
  }

  if (currentUser.role !== "professor" && currentUser.role !== "admin") {
    return (
      <main className="app-page">
        <section id="create-classroom-role-required" className="app-empty-state">
          <h1 className="app-page-heading">Join your classroom.</h1>
          <p className="app-page-description">
            Professors and administrators can create classrooms. Ask your professor for a join code
            to get started.
          </p>
          <Button asChild className="mt-6">
            <Link to={ROUTES.classrooms}>Find your class</Link>
          </Button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="app-page !max-w-3xl">
        {/* Back Link */}
        <Link
          to={ROUTES.classrooms}
          className="mb-6 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to classrooms
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="app-page-heading mb-3">Create classroom</h1>
          <p className="app-page-description">
            Give your students a place to turn shared ideas into change.
          </p>
        </div>

        {/* Form */}
        <ClassroomForm />
      </div>
    </main>
  )
}

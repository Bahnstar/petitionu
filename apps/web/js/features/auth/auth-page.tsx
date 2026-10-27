import type { ComponentProps, ReactNode } from "react"
import { Link } from "react-router-dom"
import { CircleAlert, CircleCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDocumentTitle } from "@/js/hooks/use-document-title"
import { ROUTES } from "@/lib/routes"

/** A centred auth panel with the brand above it, as on the original auth pages. */
export function AuthPage({
  title,
  description,
  children,
  links,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  links?: ReactNode
}) {
  useDocumentTitle(title)
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Link to={ROUTES.home} className="auth-brand-text" aria-label="PetitionU home">
          PetitionU<span aria-hidden="true"> ✳</span>
        </Link>
      </div>
      <main className="auth-panel">
        <h1 className="auth-heading">{title}</h1>
        {description && <p className="mb-6 text-sm text-[#567269]">{description}</p>}
        {children}
        {links && <nav className="auth-links">{links}</nav>}
      </main>
    </div>
  )
}

export function AuthField({
  id,
  label,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className="auth-field">
      <Label htmlFor={id} className="mb-2">
        {label}
      </Label>
      <Input id={id} name={id} required {...props} />
    </div>
  )
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive" className="my-4">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <Alert role="status" className="my-4">
      <CircleCheck aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

/** What Better Auth's client returns in `error`. */
export interface AuthClientError {
  readonly status: number
  readonly message?: string | undefined
  readonly code?: string | undefined
}

/** A failed auth call, thrown so `useMutation` can show it. */
export class AuthFailure extends Error {}

function failure(error: AuthClientError, message: string) {
  if (error.status === 429)
    return new AuthFailure("Too many attempts. Wait a minute and try again.")
  if (error.status >= 500 || !error.status)
    return new AuthFailure("Something went wrong. Please try again.")
  return new AuthFailure(message)
}

/** Throws Better Auth's own message for a failed form, or `fallback` when it sent none. */
export function throwAuthError(error: AuthClientError | null, fallback: string): void {
  if (error) throw failure(error, error.message || fallback)
}

/** Throws `message` for a rejected emailed link: the server only says the token is invalid. */
export function throwLinkError(error: AuthClientError | null, message: string): void {
  if (error) throw failure(error, message)
}

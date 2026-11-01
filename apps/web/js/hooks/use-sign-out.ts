import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ROUTES } from "@/lib/routes"
import { useAuth } from "../contexts/auth-context"

/** Signs out and goes home. `failed` stays true until the next attempt or leaving the page. */
export function useSignOut() {
  const { signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [failedAt, setFailedAt] = useState<string | null>(null)
  if (failedAt !== null && failedAt !== pathname) setFailedAt(null)

  const attempt = async () => {
    setFailedAt(null)
    try {
      await signOut()
    } catch {
      setFailedAt(pathname)
      return
    }
    navigate(ROUTES.home)
  }

  return { attempt, failed: failedAt !== null }
}

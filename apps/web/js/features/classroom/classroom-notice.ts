import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/** What the classroom page announces after the create or edit form sends the user to it. */
export type ClassroomNotice = { readonly kind: "created" } | { readonly kind: "updated" }

const isNotice = (state: unknown): state is ClassroomNotice =>
  typeof state === "object" &&
  state !== null &&
  "kind" in state &&
  (state.kind === "created" || state.kind === "updated")

/**
 * The notice the page was opened with, read once: the history entry's state is cleared so a
 * reload or a return to the page doesn't announce it again.
 */
export function useClassroomNotice(): ClassroomNotice | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => (isNotice(location.state) ? location.state : null))
  const arrivedWithNotice = isNotice(location.state)

  useEffect(() => {
    if (arrivedWithNotice) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: null,
      })
    }
  }, [arrivedWithNotice, location.pathname, location.search, location.hash, navigate])

  return notice
}

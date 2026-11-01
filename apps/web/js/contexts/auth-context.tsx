import React, { createContext, useContext, useEffect, ReactNode } from "react"
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query"
import { reloadCSRFToken, type MeDto } from "@petitionu/domain"
import { api } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { ROUTES } from "@/lib/routes"
import { clearAllPetitionDrafts } from "../lib/petition-draft"

export type CurrentUser = MeDto

interface AuthChange {
  readonly sameUser?: boolean
  /** Where the caller goes next, if it isn't the current page. */
  readonly destination?: string
}

const currentUserKey = ["currentUser"]
const isPageQuery = (query: Query) => query.queryKey[0] !== currentUserKey[0]

/**
 * Recovers from a CSRF token that can't be reloaded: the server renders a fresh one into the page,
 * along with the right auth state. Only a completed auth action gets here, so it can't loop.
 * Never resolves, so the caller doesn't carry on while the page goes away.
 */
function loadFullPage(destination?: string) {
  if (destination) window.location.assign(destination)
  else window.location.reload()
  return new Promise<void>(() => {})
}

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  refetch: () => void
  /**
   * Call after any sign-in or account change: reloads the CSRF token and the user, and clears
   * cached data. Pass `sameUser` when the user hasn't changed, to refresh it in place instead.
   * If the token can't be reloaded, the page loads in full, at `destination` when given.
   */
  afterAuthChange: (change?: AuthChange) => Promise<void>
  /** Rejects if the server didn't confirm the sign-out, so the session may still be live. */
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // Reading the session through Better Auth keeps its cookie alive; `getMe` doesn't refresh it.
  useEffect(() => {
    void authClient.getSession()
  }, [])

  const userQuery = useQuery({
    queryKey: currentUserKey,
    queryFn: async () => {
      const result = await api.getMe()

      if (result.success === false) {
        if (result.errors.some((e) => e.type === "not_found")) {
          return null
        }
        throw new Error(`Failed to fetch user: ${result.errors.map((e) => e.message).join(", ")}`)
      }

      return result.data
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  // The CSRF token is bound to the session, and every RPC is refused without the right one.
  const reloadToken = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await reloadCSRFToken()
        return true
      } catch (error) {
        console.error("Couldn't reload the CSRF token", error)
      }
    }
    return false
  }

  // Cached data may belong to the previous user, so a change of user starts every page empty.
  // Not awaited: a slow or retrying page query mustn't hold up the caller.
  const refreshPageQueries = (sameUser: boolean) => {
    const pageQueries = { predicate: isPageQuery }
    void (sameUser
      ? queryClient.invalidateQueries(pageQueries)
      : queryClient.resetQueries(pageQueries))
  }

  const afterAuthChange = async ({ sameUser = false, destination }: AuthChange = {}) => {
    if (!(await reloadToken())) return loadFullPage(destination)
    refreshPageQueries(sameUser)
    // A getMe already in flight was sent as the previous user, and would otherwise be reused.
    await queryClient.cancelQueries({ queryKey: currentUserKey })
    // Callers navigate next, so wait for the user. The page they land on may still render once
    // with the old one, because observers hear about the result a tick later.
    await queryClient.invalidateQueries({ queryKey: currentUserKey })
  }

  // Better Auth resolves a refused sign-out with `error`, so a failure has to be thrown here.
  // Once the server confirms, nobody is signed in, so there's no user to refetch.
  const signOut = async () => {
    const { error } = await authClient.signOut()
    if (error) throw new Error(error.message || "Sign-out failed")
    await queryClient.cancelQueries({ queryKey: currentUserKey })
    queryClient.setQueryData(currentUserKey, null)
    // Only sign-out: a draft written before signing in or finishing a profile is meant to stay.
    clearAllPetitionDrafts()
    if (!(await reloadToken())) return loadFullPage(ROUTES.home)
    refreshPageQueries(false)
  }

  const value: AuthContextType = {
    user: userQuery.data ?? null,
    isLoading: userQuery.isPending,
    isAuthenticated: !!userQuery.data,
    error: userQuery.error,
    refetch: () => queryClient.invalidateQueries({ queryKey: currentUserKey }),
    afterAuthChange,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

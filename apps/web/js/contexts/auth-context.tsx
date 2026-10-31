import React, { createContext, useContext, useEffect, ReactNode } from "react"
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query"
import { reloadCSRFToken, type MeDto } from "@petitionu/domain"
import { api } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

export type CurrentUser = MeDto

interface AuthChange {
  readonly sameUser?: boolean
}

const currentUserKey = ["currentUser"]
const isPageQuery = (query: Query) => query.queryKey[0] !== currentUserKey[0]

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  refetch: () => void
  /**
   * Call after any sign-in or account change: reloads the CSRF token and the user, and clears
   * cached data. Pass `sameUser` when the user hasn't changed, to refresh it in place instead.
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

  // The CSRF token is bound to the session, so it must be replaced before the next RPC call. A
  // failed reload can't undo the auth change, so the UI still has to follow it.
  const reloadToken = async () => {
    try {
      await reloadCSRFToken()
    } catch (error) {
      console.error("Couldn't reload the CSRF token", error)
    }
  }

  // Cached data may belong to the previous user, so a change of user starts every page empty.
  // Not awaited: a slow or retrying page query mustn't hold up the caller.
  const refreshPageQueries = (sameUser: boolean) => {
    const pageQueries = { predicate: isPageQuery }
    void (sameUser
      ? queryClient.invalidateQueries(pageQueries)
      : queryClient.resetQueries(pageQueries))
  }

  const afterAuthChange = async ({ sameUser = false }: AuthChange = {}) => {
    await reloadToken()
    refreshPageQueries(sameUser)
    // Callers navigate next, and the page they land on needs to know who is signed in.
    await queryClient.invalidateQueries({ queryKey: currentUserKey })
  }

  // Better Auth resolves a refused sign-out with `error`, so a failure has to be thrown here.
  // Once the server confirms, nobody is signed in, so there's no user to refetch.
  const signOut = async () => {
    const { error } = await authClient.signOut()
    if (error) throw new Error(error.message || "Sign-out failed")
    await queryClient.cancelQueries({ queryKey: currentUserKey })
    queryClient.setQueryData(currentUserKey, null)
    await reloadToken()
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

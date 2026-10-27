import React, { createContext, useContext, useEffect, ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { reloadCSRFToken, type MeDto } from "@petitionu/domain"
import { api } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

export type CurrentUser = MeDto

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  refetch: () => void
  /** Call after any sign-in, sign-out or account change: reloads the CSRF token and the user. */
  afterAuthChange: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // Reading the session through Better Auth keeps its cookie alive; `getMe` doesn't refresh it.
  useEffect(() => {
    void authClient.getSession({ query: {} })
  }, [])

  const userQuery = useQuery({
    queryKey: ["currentUser"],
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

  // The CSRF token is bound to the session, so it must be replaced before the next RPC call.
  // Every cached query may depend on who is signed in, so all of them refetch.
  const afterAuthChange = async () => {
    await reloadCSRFToken()
    await queryClient.invalidateQueries()
  }

  const signOut = async () => {
    await authClient.signOut({})
    await afterAuthChange()
  }

  const value: AuthContextType = {
    user: userQuery.data ?? null,
    isLoading: userQuery.isPending,
    isAuthenticated: !!userQuery.data,
    error: userQuery.error,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["currentUser"] }),
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

import React, { createContext, useContext, ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getMe, buildCSRFHeaders, UserResourceSchema } from "../ash_rpc"
import { CleanResource } from "@/lib/types"

export type CurrentUser = CleanResource<UserResourceSchema>

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  refetch: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const USER_FIELDS = [
  "id",
  "email",
  "firstName",
  "lastName",
  "role",
  "insertedAt",
] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const userQuery = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const result = await getMe({
        fields: [...USER_FIELDS],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        // If user is not authenticated, return null (not an error)
        // The RPC will return no data if there's no actor
        if (result.errors.some((e) => e.message?.includes("not found") || e.type === "not_found")) {
          return null
        }
        throw new Error(`Failed to fetch user: ${result.errors.map((e) => e.message).join(", ")}`)
      }

      return result.data as CurrentUser
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - user data doesn't change often
    retry: false, // Don't retry if user is not authenticated
  })

  const value: AuthContextType = {
    user: userQuery.data ?? null,
    isLoading: userQuery.isPending,
    isAuthenticated: !!userQuery.data,
    error: userQuery.error,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["currentUser"] }),
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

/**
 * Hook that requires authentication - throws if user is not authenticated.
 * Use this in components that should only be rendered for authenticated users.
 */
export function useRequireAuth(): CurrentUser {
  const { user, isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    throw new Promise(() => {}) // Suspense-compatible loading
  }

  if (!isAuthenticated || !user) {
    // Redirect to login or throw an error
    // For now, we'll redirect to the sign-in page
    window.location.href = "/sign-in"
    throw new Error("Authentication required")
  }

  return user
}

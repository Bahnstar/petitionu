import React, { createContext, useContext, ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getMe, buildCSRFHeaders, GetMeFields, InferGetMeResult } from "../ash_rpc"

export type CurrentUser = InferGetMeResult<typeof USER_FIELDS>

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  refetch: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const USER_FIELDS = [
  "id",
  "email",
  "firstName",
  "lastName",
  "role",
  "insertedAt",
  "graduationYear",
  "emailVerified",
  "profileComplete",
  "organizationId",
  { organization: ["id", "name"] },
] satisfies GetMeFields

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
        if (result.errors.some((e) => e.message?.includes("not found") || e.type === "not_found")) {
          return null
        }
        throw new Error(`Failed to fetch user: ${result.errors.map((e) => e.message).join(", ")}`)
      }

      return result.data
    },
    staleTime: 60 * 1000,
    retry: false,
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

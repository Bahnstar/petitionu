import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Header } from "./components/header"
import { HomePage } from "./pages/home-page"
import PetitionIndexPage from "./pages/petition-index-page"
import DashboardPage from "./pages/dashboard-page"
import BrowsePetitionsPage from "./pages/browse-petitions-page"
import CreatePetitionPage from "./pages/create-petition-page"
import ClassroomsPage from "./pages/classrooms-page"
import ClassroomDetailPage from "./pages/classroom-detail-page"
import CreateClassroomPage from "./pages/create-classroom-page"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "../components/ui/error-boundary"
import { AuthProvider } from "./contexts/auth-context"

// Create a client instance with proper configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx client errors
        if (error instanceof Error) {
          const status = (error as any).status ?? (error as any).response?.status
          if (status && status >= 400 && status < 500) {
            return false
          }
        }
        return failureCount < 3
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
})

export const App = () => {
  const defaultPath = "/ash-typescript"

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
              <Header />
              <main>
                <Routes>
                  <Route path={defaultPath} element={<HomePage />} />
                  <Route path={`${defaultPath}/petitions`} element={<BrowsePetitionsPage />} />
                  <Route path={`${defaultPath}/petitions/:id`} element={<PetitionIndexPage />} />
                  <Route path={`${defaultPath}/create`} element={<CreatePetitionPage />} />
                  <Route path={`${defaultPath}/dashboard`} element={<DashboardPage />} />
                  <Route path={`${defaultPath}/classrooms`} element={<ClassroomsPage />} />
                  <Route path={`${defaultPath}/classrooms/new`} element={<CreateClassroomPage />} />
                  <Route path={`${defaultPath}/classrooms/:id`} element={<ClassroomDetailPage />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

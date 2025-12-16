import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Header } from "./components/header"
import { HomePage } from "./pages/home-page"
import PetitionIndexPage from "./pages/petition-index-page"
import DashboardPage from "./pages/dashboard-page"
import BrowsePetitionsPage from "./pages/browse-petitions-page"
import CreatePetitionPage from "./pages/create-petition-page"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "../components/ui/error-boundary"

// Create a client instance with proper configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes('4')) {
          return false
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
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

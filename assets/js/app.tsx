import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Header } from "./components/header"
import { HomePage } from "./pages/home-page"
import PetitionIndexPage from "./pages/petition-index-page"
import DashboardPage from "./pages/dashboard-page"
import BrowsePetitionsPage from "./pages/browse-petitions-page"
import CreatePetitionPage from "./pages/create-petition-page"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

export const App = () => {
  const defaultPath = "/ash-typescript"
  const queryClient = new QueryClient()

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
        <QueryClientProvider client={queryClient}>
          <Header />
          <Routes>
            <Route path={defaultPath} element={<HomePage />} />
            <Route path={`${defaultPath}/petitions`} element={<BrowsePetitionsPage />} />
            <Route path={`${defaultPath}/petitions/:id`} element={<PetitionIndexPage />} />
            <Route path={`${defaultPath}/create`} element={<CreatePetitionPage />} />
            <Route path={`${defaultPath}/dashboard`} element={<DashboardPage />} />
          </Routes>
        </QueryClientProvider>
      </div>
    </BrowserRouter>
  )
}

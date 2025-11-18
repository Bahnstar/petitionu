import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Header } from "./components/header"
import { HomePage } from "./components/home-page"
import { PetitionsPage } from "./components/petitions-page"
import { CreatePetitionPage } from "./components/create-petition-page"
import PetitionIndexPage from "./components/petition"
import DashboardPage from "./components/dashboard-page"

export const App = () => {
  const defaultPath = "/ash-typescript"
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
        <Header />
        <Routes>
          <Route path={defaultPath} element={<HomePage />} />
          <Route path={`${defaultPath}/petitions`} element={<PetitionsPage />} />
          <Route path={`${defaultPath}/petitions/:id`} element={<PetitionIndexPage />} />
          <Route path={`${defaultPath}/create`} element={<CreatePetitionPage />} />
          <Route path={`${defaultPath}/dashboard`} element={<DashboardPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

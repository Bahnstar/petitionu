import React from "react"
import { useDocumentTitle } from "../hooks/use-document-title"
import { LandingPage } from "./landing-page"

export const HomePage = () => {
  useDocumentTitle("Your campus. Your say.")

  return <LandingPage />
}

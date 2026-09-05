// THROWAWAY: each home concept owns its navigation hierarchy and brand treatment.
import React from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/auth-context"

type HeaderProps = { startDraft: () => void }

function Brand({ className = "" }: { className?: string }) {
  const { search } = useLocation()
  return (
    <Link className={`hp-brand ${className}`} to={`/ash-typescript${search}`} aria-label="PetitionU home">
      <span className="hp-brand-mark" aria-hidden="true">p<span>u</span></span>
      <span>PetitionU</span>
    </Link>
  )
}

function AccountLink() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
    ? <Link className="hp-account-link" to="/ash-typescript/dashboard">My dashboard</Link>
    : <a className="hp-account-link" href="/sign-in">Sign in</a>
}

export function CampaignHeader({ startDraft }: HeaderProps) {
  return (
    <header id="prototype-header" className="hp-site-header hp-campaign-header">
      <Brand />
      <nav aria-label="Main navigation" className="hp-header-links">
        <a href="#prototype-petitions" aria-current="page">Find a cause</a>
        <Link to="/ash-typescript/classrooms">Your classrooms</Link>
        <span className="hp-mobile-account"><AccountLink /></span>
      </nav>
      <div className="hp-header-actions"><AccountLink /><button id="prototype-header-create" type="button" onClick={startDraft}>Start a petition <span aria-hidden="true">+</span></button></div>
    </header>
  )
}

export function BoardHeader({ startDraft }: HeaderProps) {
  return (
    <header id="prototype-header" className="hp-site-header hp-board-header">
      <Brand />
      <nav aria-label="Main navigation" className="hp-header-links">
        <a href="#prototype-petitions" aria-current="page"><span className="hero-squares-2x2 size-4" aria-hidden="true" />Campus board</a>
        <Link to="/ash-typescript/classrooms"><span className="hero-user-group size-4" aria-hidden="true" />Classrooms</Link>
        <Link to="/ash-typescript/dashboard">My activity</Link>
        <span className="hp-mobile-account"><AccountLink /></span>
      </nav>
      <div className="hp-header-actions"><AccountLink /><button id="prototype-header-create" type="button" onClick={startDraft}><span aria-hidden="true">+</span> Start a petition</button></div>
    </header>
  )
}

export function ExplorerHeader({ startDraft }: HeaderProps) {
  return (
    <header id="prototype-header" className="hp-site-header hp-explorer-header">
      <nav aria-label="Main navigation" className="hp-header-links">
        <a href="#prototype-petitions" aria-current="page">Explore causes</a>
        <Link to="/ash-typescript/classrooms">Classrooms</Link>
        <span className="hp-mobile-account"><AccountLink /></span>
      </nav>
      <Brand />
      <div className="hp-header-actions"><AccountLink /><button id="prototype-header-create" type="button" onClick={startDraft}>Start a petition</button></div>
    </header>
  )
}

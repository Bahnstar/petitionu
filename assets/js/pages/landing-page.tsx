import { AuthLink } from "../components/auth-link"
import React, { useState } from "react"
import { LazyMotion, domAnimation, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { Link } from "react-router-dom"
import { ROUTES } from "@/lib/routes"
import { useAuth } from "../contexts/auth-context"

function LandingAccountLink({ id }: { id: string }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null

  return isAuthenticated ? (
    <Link id={id} to={ROUTES.dashboard}>
      My dashboard
    </Link>
  ) : (
    <AuthLink id={id}>Sign in</AuthLink>
  )
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span>PetitionU</span>
      <p>A place for student voices.</p>
      <nav aria-label="Footer navigation">
        <Link id="landing-footer-browse" to={ROUTES.petitions}>
          Browse petitions
        </Link>
        <LandingAccountLink id="landing-footer-account" />
      </nav>
    </footer>
  )
}

function LandingPlacards() {
  const reduceMotion = useReducedMotion()
  const [settled, setSettled] = useState({ left: false, right: false })

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="landing-placards" aria-label="Examples of campus changes">
        <m.figure
          className="landing-sign landing-sign-left"
          data-settled={settled.left}
          initial={reduceMotion ? false : { transform: "var(--landing-sign-enter)" }}
          whileInView={{ transform: "none" }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: reduceMotion ? 0 : 0.85, ease: [0.25, 0.1, 0.25, 1] }}
          onAnimationComplete={() => setSettled((value) => ({ ...value, left: true }))}
        >
          <span>For the late-night thinkers</span>
          <strong>
            Late labs.
            <br />
            Later library.
          </strong>
          <span className="hero-moon size-9" aria-hidden="true" />
          <figcaption>A little more time to learn.</figcaption>
        </m.figure>
        <m.figure
          className="landing-sign landing-sign-right"
          data-settled={settled.right}
          initial={reduceMotion ? false : { transform: "var(--landing-sign-enter)" }}
          whileInView={{ transform: "none" }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{
            duration: reduceMotion ? 0 : 0.85,
            delay: reduceMotion ? 0 : 0.09,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          onAnimationComplete={() => setSettled((value) => ({ ...value, right: true }))}
        >
          <span>For everyone finding their people</span>
          <strong>
            More room
            <br />
            to belong.
          </strong>
          <div className="landing-linked-circles" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <figcaption>Let's make space for each other.</figcaption>
        </m.figure>
      </div>
    </LazyMotion>
  )
}

export function LandingPage() {
  return (
    <div id="landing-page" className="landing-page">
      <section id="landing-top" className="landing-hero">
        <div className="landing-introduction">
          <p>For the things worth speaking up about.</p>
          <h1>
            Your campus.
            <br />
            Your say.
          </h1>
          <p>
            Better study spaces. More affordable meals. A place to belong.
            <br className="landing-desktop-break" /> Bring your idea to PetitionU and find the
            people who care, too.
          </p>
          <div className="landing-actions">
            <Link id="landing-primary" className="landing-cta" to={ROUTES.createPetition}>
              Start a petition
            </Link>
            <a href="#landing-how">See how it works</a>
          </div>
          <span className="landing-small-note">One idea is a good place to start.</span>
        </div>
        <LandingPlacards />
        <div className="landing-groundline">
          <span>A small ask</span>
          <span aria-hidden="true">⟶</span>
          <span>A shared idea</span>
          <span aria-hidden="true">⟶</span>
          <span>A better campus</span>
        </div>
      </section>

      <section id="landing-how" className="landing-how landing-section">
        <div className="landing-section-intro">
          <p>From “someone should” to “let's do it.”</p>
          <h2>
            Start small.
            <br />
            Bring people with you.
          </h2>
        </div>
        <ol className="landing-steps">
          <li>
            <span>1</span>
            <div>
              <h3>Say what you'd change.</h3>
              <p>Turn that thing you keep talking about into one clear ask.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Find your people.</h3>
              <p>Share your petition with classmates and gather their support.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Make your case together.</h3>
              <p>Take your idea and the voices behind it to the people who can help.</p>
            </div>
          </li>
        </ol>
      </section>
      <section id="landing-why" className="landing-closing landing-section">
        <span className="hero-chat-bubble-left-right size-9" aria-hidden="true" />
        <h2>You know what campus could be.</h2>
        <p>
          PetitionU gives students a place to put ideas into words, gather signatures, and take the
          next step together.
        </p>
        <Link id="landing-closing-create" className="landing-cta" to={ROUTES.createPetition}>
          Let's start with your idea
        </Link>
      </section>
      <LandingFooter />
    </div>
  )
}

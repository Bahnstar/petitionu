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
  const { isAuthenticated } = useAuth()
  return (
    <footer className="landing-footer">
      <div>
        <span>PetitionU</span>
        <p>A place for student voices.</p>
      </div>
      <nav aria-label="Footer navigation">
        {isAuthenticated ? (
          <Link id="landing-footer-browse" to={ROUTES.petitions}>
            Browse petitions
          </Link>
        ) : null}
        <Link to={ROUTES.support}>Support</Link>
        <Link to={ROUTES.privacy}>Privacy</Link>
        <Link to={ROUTES.communityRules}>Community rules</Link>
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

// The hero's second action and note change with sign-in state: a visitor learns how the
// site works and what signing in needs, while a signed-in student gets straight to petitions.
function LandingHeroActions() {
  const { user, isAuthenticated, isLoading } = useAuth()

  let note: React.ReactNode = null
  if (!isLoading && isAuthenticated) {
    note = (
      <p className="landing-small-note">
        {user?.firstName ? `Welcome back, ${user.firstName}. ` : "Welcome back. "}
        <Link to={ROUTES.dashboard}>Your dashboard</Link> keeps your petitions and signatures
        together.
      </p>
    )
  } else if (!isLoading) {
    note = (
      <p className="landing-small-note">
        Sign in with your school email to publish or sign petitions.
      </p>
    )
  }

  return (
    <>
      <div className="landing-actions">
        <Link id="landing-primary" className="landing-cta" to={ROUTES.createPetition}>
          Start a petition
        </Link>
        {isAuthenticated ? (
          <Link id="landing-secondary" to={ROUTES.petitions}>
            Browse petitions
          </Link>
        ) : (
          <a id="landing-secondary" href="#landing-how">
            See how it works
          </a>
        )}
      </div>
      {note}
    </>
  )
}

function LandingClosingActions() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="landing-actions">
      <Link id="landing-closing-create" className="landing-cta" to={ROUTES.createPetition}>
        Let's start with your idea
      </Link>
      {isAuthenticated ? (
        <Link id="landing-closing-browse" to={ROUTES.petitions}>
          Browse petitions
        </Link>
      ) : (
        <AuthLink id="landing-closing-account">Sign in</AuthLink>
      )}
    </div>
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
          <LandingHeroActions />
        </div>
        <LandingPlacards />
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
              <p>Share the link with classmates and your classroom, and watch signatures add up.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Make your case together.</h3>
              <p>
                Bring the petition and everyone behind it to student government, a department, or
                the dean's office.
              </p>
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
        <ul className="landing-reasons">
          <li>
            <h3>Only your campus.</h3>
            <p>
              You sign in with your school email and PetitionU checks the school. Petitions stay
              among the people they affect.
            </p>
          </li>
          <li>
            <h3>Made for classrooms too.</h3>
            <p>
              A professor can open a classroom where a class drafts petitions together and sees what
              its members care about.
            </p>
          </li>
          <li>
            <h3>Kept respectful.</h3>
            <p>
              <Link to={ROUTES.communityRules}>Community rules</Link> and moderators keep petitions
              about ideas, not people.
            </p>
          </li>
        </ul>
        <LandingClosingActions />
      </section>
      <LandingFooter />
    </div>
  )
}

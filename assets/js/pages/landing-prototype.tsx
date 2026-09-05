// THROWAWAY: public landing pages D–G. G combines D's layout with F's palette.
import React from "react"

export type LandingProps = {
  idea: number
  setIdea: (idea: number) => void
  startDraft: (title?: string) => void
}

export const landingIdeas = [
  { label: "Study spaces", question: "What if late nights had a place to study?", title: "Keep the library open until midnight" },
  { label: "Food & dining", question: "What if a good meal fit a student budget?", title: "Bring affordable evening meals to campus" },
  { label: "Accessibility", question: "What if every route to class was accessible?", title: "Make every campus building accessible" },
]

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <span>PetitionU</span>
      <p>A place for student voices.</p>
      <a href="/sign-in">Sign in</a>
    </footer>
  )
}

export function OpenInvitation({ startDraft }: LandingProps) {
  return (
    <div className="lp-invitation">
      <header id="prototype-header" className="lp-d-header">
        <a href="#landing-top" className="lp-d-brand" aria-label="PetitionU home">PetitionU<span aria-hidden="true">✳</span></a>
        <nav aria-label="Main navigation"><a href="#landing-how">How it works</a><a href="#landing-why">Why PetitionU</a></nav>
        <div><a href="/sign-in">Sign in</a><button id="prototype-header-create" type="button" onClick={() => startDraft()}>Start a petition</button></div>
      </header>

      <section id="landing-top" className="lp-d-hero">
        <div className="lp-d-introduction">
          <p>For the things worth speaking up about.</p>
          <h1>Your campus.<br />Your say.</h1>
          <p>Better study spaces. More affordable meals. A place to belong.<br className="lp-desktop-break" /> Bring your idea to PetitionU and find the people who care, too.</p>
          <div className="lp-actions"><button id="landing-primary" type="button" onClick={() => startDraft()}>Start a petition</button><a href="#landing-how">See how it works</a></div>
          <span className="lp-d-small-note">One idea is a good place to start.</span>
        </div>
        <div className="lp-d-placards" aria-label="Examples of campus changes">
          <figure className="lp-d-sign lp-d-sign-left"><span>For the late-night thinkers</span><strong>Late labs.<br />Later library.</strong><span className="hero-moon size-9" aria-hidden="true" /><figcaption>A little more time to learn.</figcaption></figure>
          <figure className="lp-d-sign lp-d-sign-right"><span>For everyone finding their people</span><strong>More room<br />to belong.</strong><div className="lp-d-linked-circles" aria-hidden="true"><i /><i /><i /></div><figcaption>Let's make space for each other.</figcaption></figure>
        </div>
        <div className="lp-d-groundline"><span>A small ask</span><span aria-hidden="true">⟶</span><span>A shared idea</span><span aria-hidden="true">⟶</span><span>A better campus</span></div>
      </section>

      <section id="landing-how" className="lp-d-how lp-section">
        <div className="lp-section-intro"><p>From “someone should” to “let's do it.”</p><h2>Start small.<br />Bring people with you.</h2></div>
        <ol className="lp-d-steps">
          <li><span>1</span><div><h3>Say what you'd change.</h3><p>Turn that thing you keep talking about into one clear ask.</p></div></li>
          <li><span>2</span><div><h3>Find your people.</h3><p>Share your petition with classmates and gather their support.</p></div></li>
          <li><span>3</span><div><h3>Make your case together.</h3><p>Take your idea and the voices behind it to the people who can help.</p></div></li>
        </ol>
      </section>
      <section id="landing-why" className="lp-d-closing lp-section"><span className="hero-chat-bubble-left-right size-9" aria-hidden="true" /><h2>You know what campus could be.</h2><p>PetitionU gives students a place to put ideas into words, gather signatures, and take the next step together.</p><button type="button" onClick={() => startDraft()}>Let's start with your idea</button></section>
      <LandingFooter />
    </div>
  )
}

export function CampusStory({ startDraft }: LandingProps) {
  return (
    <div className="lp-story">
      <div className="lp-e-intro" id="landing-top">
        <img className="lp-e-photo" src="/images/prototypes/campus-story.png" alt="Students walking together through a leafy university courtyard" width={1672} height={941} fetchPriority="high" />
        <header id="prototype-header" className="lp-e-header">
          <a href="#landing-top" className="lp-e-brand">PetitionU</a>
          <nav aria-label="Main navigation"><a href="#landing-why">Our purpose</a><a href="#landing-how">How it works</a><a href="/sign-in">Sign in</a></nav>
          <button id="prototype-header-create" type="button" onClick={() => startDraft()}>Start a petition</button>
        </header>
        <section className="lp-e-hero">
          <p>A better campus is something we build together.</p>
          <h1>This place<br />can be better.<br />Because of you.</h1>
          <p>You've got ideas for the place you call campus.<br className="lp-desktop-break" /> PetitionU helps you put them into motion.</p>
          <div className="lp-actions"><button id="landing-primary" type="button" onClick={() => startDraft()}>Start something good</button><a href="#landing-why">Meet PetitionU</a></div>
        </section>
        <span className="lp-e-photo-caption">Illustrative campus scene</span>
      </div>

      <section id="landing-why" className="lp-e-purpose lp-section">
        <div><p>The place you learn. The place you live.</p><h2>You have a part<br />in what it becomes.</h2></div>
        <div><p>Sometimes it starts with a conversation after class. A better way to get home. A quieter place to study. Something you wish worked a little differently.</p><p>PetitionU is a place to turn that conversation into a petition, bring other students together, and make a clear case for change.</p><a href="#landing-how">Here's where to begin <span aria-hidden="true">↘</span></a></div>
      </section>
      <section id="landing-how" className="lp-e-how lp-section">
        <h2>A conversation can become a beginning.</h2>
        <ol><li><span>01</span><h3>Put your idea into words.</h3><p>What would you change, and who would it help? Start there.</p></li><li><span>02</span><h3>Invite others in.</h3><p>Share your petition and give classmates a way to add their voice.</p></li><li><span>03</span><h3>Take the next step.</h3><p>Bring that support to the people who can help your idea move forward.</p></li></ol>
        <button type="button" onClick={() => startDraft()}>Create your first petition</button>
      </section>
      <LandingFooter />
    </div>
  )
}

export function FirstStep({ idea, setIdea, startDraft }: LandingProps) {
  const selected = landingIdeas[idea] ?? landingIdeas[0]
  return (
    <div className="lp-first-step">
      <header id="prototype-header" className="lp-f-header">
        <a href="#landing-top" className="lp-f-brand"><span aria-hidden="true">p<span>u</span></span>PetitionU</a>
        <nav aria-label="Main navigation"><a href="#landing-how">How it works</a><a href="#landing-questions">A few questions</a></nav>
        <div><a href="/sign-in">Sign in</a><button id="prototype-header-create" type="button" onClick={() => startDraft()}>Start a petition</button></div>
      </header>

      <section id="landing-top" className="lp-f-hero">
        <div className="lp-f-message"><p>Something on your mind?</p><h1>You don't need<br />all the answers.<br />Just an idea.</h1><p>PetitionU helps students turn everyday “what ifs” into a shared ask for a better campus. Start with what you care about. Build from there.</p><div className="lp-actions"><button id="landing-primary" type="button" onClick={() => startDraft()}>Start a petition</button><a href="#landing-how">How it works</a></div><p className="lp-f-reassurance">You can work on the words as you go.</p></div>
        <div className="lp-f-idea">
          <figure className="lp-f-letter" aria-live="polite"><span className="lp-f-tape" aria-hidden="true" /><span>Dear campus,</span><blockquote id="landing-example">{selected.question}</blockquote><figcaption>Yours,<br /><span>a student with an idea</span></figcaption><span className="hero-heart size-10" aria-hidden="true" /></figure>
          <div className="lp-f-examples"><p>Try an idea</p><div aria-label="Example petition ideas">{landingIdeas.map((item, index) => <button id={`landing-idea-${index}`} type="button" key={item.label} aria-pressed={index === idea} onClick={() => setIdea(index)}>{item.label}</button>)}</div><button id="landing-use-idea" className="lp-f-use-idea" type="button" onClick={() => startDraft(selected.title)}>Start with this idea</button></div>
        </div>
      </section>

      <section id="landing-how" className="lp-f-how lp-section"><h2>One idea.<br />A few simple steps.</h2><ol><li><span className="hero-pencil-square size-6" aria-hidden="true" /><h3>Write your ask.</h3><p>Tell people what you'd like to change and why it matters.</p></li><li><span className="hero-chat-bubble-left-right size-6" aria-hidden="true" /><h3>Share it around.</h3><p>Give your classmates a way to say, “I want that, too.”</p></li><li><span className="hero-paper-airplane size-6" aria-hidden="true" /><h3>Bring it forward.</h3><p>Use that support to start a conversation with decision-makers.</p></li></ol></section>
      <section id="landing-questions" className="lp-f-questions lp-section"><div><p>Before you begin</p><h2>A few things<br />you might be wondering.</h2></div><div>
        <details id="landing-faq-1"><summary>Do I need to have it all figured out?</summary><p>No. Start with a specific change you care about. Your petition can explain the problem and ask others to help you move it forward.</p></details>
        <details id="landing-faq-2"><summary>What makes a good petition?</summary><p>A clear request, a reason it matters, and an idea of who can help. “Extend library hours during finals” gives people something concrete to support.</p></details>
        <details id="landing-faq-3"><summary>How do I build support?</summary><p>Start with the people affected by the issue. Share your petition with classmates, explain what you're asking for, and invite them to add their signature.</p></details>
      </div></section>
      <div className="lp-f-last-ask"><p>Your “what if” belongs here.</p><button type="button" onClick={() => startDraft()}>Start a petition</button></div>
      <LandingFooter />
    </div>
  )
}

export const publicLandingVariants: Record<string, React.ComponentType<LandingProps>> = {
  D: OpenInvitation,
  E: CampusStory,
  F: FirstStep,
  G: OpenInvitation,
}

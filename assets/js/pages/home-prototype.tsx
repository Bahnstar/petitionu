// THROWAWAY: Earlier home explorations A–C and public landing pages D–F.
// Question: should discovery begin with a campaign, a campus feed, or a cause?
import React, { useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PrototypeSwitcher, homeVariants } from "../components/prototype-switcher"
import { CampaignHeader, BoardHeader, ExplorerHeader } from "../components/prototype-headers"
import { landingIdeas, publicLandingVariants } from "./landing-prototype"

type PetitionContent = { id: string; title: string; description?: string | null }
type PreviewPetition = PetitionContent & {
  category: string
  author: string
  signatures: number
  goal: number
  initials: string
}

const samplePetitions: PreviewPetition[] = [
  {
    id: "library", title: "Keep the library open until midnight.",
    description: "Late labs. Long commutes. One quiet place to finish. Help us extend library hours so everyone has room to study.",
    category: "Academic", author: "Sarah Chen", initials: "SC", signatures: 842, goal: 1000,
  },
  {
    id: "dining", title: "Good food shouldn't clock out at 7.",
    description: "Bring an affordable late-night meal option to campus for students who work, train, and study after hours.",
    category: "Food & Dining", author: "Michael Rodriguez", initials: "MR", signatures: 326, goal: 500,
  },
  {
    id: "access", title: "Every building. Every student.",
    description: "Repair automatic doors and publish step-free routes so getting to class is never the hardest part of the day.",
    category: "Accessibility", author: "Jessica Williams", initials: "JW", signatures: 218, goal: 300,
  },
  {
    id: "wellness", title: "Make room for a mental health day.",
    description: "Let students take two excused wellness days each semester without needing to explain a difficult day.",
    category: "Wellness", author: "Alex Thompson", initials: "AT", signatures: 467, goal: 750,
  },
]

const categories = ["All causes", "Academic", "Food & Dining", "Accessibility", "Wellness", "Campus Life"]

type VariantProps = {
  petitions: PreviewPetition[]
  allPetitions: PreviewPetition[]
  category: string
  setCategory: (category: string) => void
  search: string
  setSearch: (search: string) => void
  signed: string[]
  openPetition: (id: string) => void
  startDraft: () => void
  selectedId: string | null
  setSelectedId: (id: string) => void
}

function Progress({ petition, signed }: { petition: PreviewPetition; signed: boolean }) {
  const count = petition.signatures + (signed ? 1 : 0)
  return (
    <div className="hp-progress">
      <div><strong>{count.toLocaleString()} students signed</strong><span>Goal: {petition.goal.toLocaleString()}</span></div>
      <progress value={Math.min(count, petition.goal)} max={petition.goal} aria-label={`Signatures for ${petition.title}`} />
    </div>
  )
}

function Search({ search, setSearch }: Pick<VariantProps, "search" | "setSearch">) {
  return (
    <label className="hp-search" htmlFor="prototype-search">
      <span className="hero-magnifying-glass size-5" aria-hidden="true" />
      <span className="sr-only">Search petitions</span>
      <input id="prototype-search" type="search" placeholder="Find a change you care about" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
  )
}

function Filters({ category, setCategory }: Pick<VariantProps, "category" | "setCategory">) {
  return (
    <div className="hp-filters" aria-label="Filter by cause">
      {categories.map((item) => (
        <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
      ))}
    </div>
  )
}

function EmptyResults({ setCategory, setSearch }: Pick<VariantProps, "setCategory" | "setSearch">) {
  return <div className="hp-empty"><h3>No petitions match yet.</h3><p>Try another cause or clear your search.</p><button type="button" className="hp-button" onClick={() => { setCategory("All causes"); setSearch("") }}>Show all petitions</button></div>
}

export function CampaignPoster(props: VariantProps) {
  const featured = props.allPetitions[0]
  return (
    <div className="hp-poster">
      <section className="hp-poster-hero">
        <div className="hp-poster-message">
          <p className="hp-campus-line"><span className="hp-live-dot" /> A better campus starts with us.</p>
          <h1>Small ask.<br />Big change.</h1>
          <p>The thing everyone talks about after class?<br />Let's do something about it.</p>
          <div className="hp-actions"><a className="hp-button" href="#prototype-petitions">Find your cause</a><button type="button" className="hp-text-button" onClick={props.startDraft}>Start a petition</button></div>
        </div>
        <div className="hp-campaign-wrap">
          <span className="hp-poster-stamp">Your voice<br />belongs here.</span>
          <article className="hp-campaign-ticket">
            <div className="hp-ticket-top"><span>A campus worth staying up for</span><span className="hero-moon size-6" aria-hidden="true" /></div>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <div className="hp-ticket-bottom">
              <Progress petition={featured} signed={props.signed.includes(featured.id)} />
              <button id="prototype-featured" className="hp-button" type="button" onClick={() => props.openPetition(featured.id)}>Add your voice</button>
            </div>
          </article>
          <p className="hp-poster-caption">One idea. A whole campus behind it.</p>
        </div>
      </section>
      <section id="prototype-petitions" className="hp-poster-discover">
        <div className="hp-section-heading"><h2>What matters to you?</h2><Search {...props} /></div>
        <Filters {...props} />
        <div className="hp-poster-grid">
          {props.petitions.map((petition, index) => (
            <button className={`hp-mini-campaign hp-mini-${index % 3}`} key={petition.id} type="button" onClick={() => props.openPetition(petition.id)}>
              <span>{petition.category}</span><h3>{petition.title}</h3><span className="hp-mini-footer">{petition.signatures + Number(props.signed.includes(petition.id))} voices and counting <span aria-hidden="true">↗</span></span>
            </button>
          ))}
        </div>
        {props.petitions.length === 0 ? <EmptyResults {...props} /> : null}
      </section>
    </div>
  )
}

export function CampusBoard(props: VariantProps) {
  return (
    <div className="hp-board">
      <aside className="hp-board-sidebar">
        <div className="hp-board-campus"><span className="hero-building-library size-7" aria-hidden="true" /><div><strong>Your campus</strong><span>Student action board</span></div></div>
        <p>Explore by cause</p><Filters {...props} />
        <div className="hp-sidebar-note"><span className="hero-chat-bubble-left-right size-6" aria-hidden="true" /><h3>Heard it in the group chat?</h3><p>Turn “someone should” into a petition.</p><button type="button" onClick={props.startDraft}>Start with an idea</button></div>
      </aside>
      <section className="hp-board-feed" id="prototype-petitions">
        <div className="hp-board-title"><div><p>Made by students. Moved by students.</p><h1>What's happening<br />on your campus.</h1></div><span className="hp-board-symbol" aria-hidden="true">✳</span></div>
        <Search {...props} />
        <div className="hp-feed-heading"><h2>{props.category === "All causes" ? "Open petitions" : props.category}</h2><span>{props.petitions.length} to explore</span></div>
        <div className="hp-feed-list">
          {props.petitions.map((petition) => (
            <article key={petition.id} className="hp-feed-item">
              <div className="hp-author"><span className="hp-avatar">{petition.initials}</span><div><strong>{petition.author}</strong><span>{petition.category}</span></div>{props.signed.includes(petition.id) ? <span className="hp-signed-tag">You signed</span> : null}</div>
              <button type="button" className="hp-feed-link" onClick={() => props.openPetition(petition.id)}><h3>{petition.title}</h3></button>
              <p>{petition.description}</p>
              <div className="hp-feed-bottom"><Progress petition={petition} signed={props.signed.includes(petition.id)} /><button className="hp-button" type="button" onClick={() => props.openPetition(petition.id)}>View petition</button></div>
            </article>
          ))}
        </div>
        {props.petitions.length === 0 ? <EmptyResults {...props} /> : null}
      </section>
      <aside className="hp-board-right">
        <div className="hp-board-callout"><span className="hero-hand-raised size-8" aria-hidden="true" /><h2>You don't need a title to make a difference.</h2><p>You just need an idea, and a few people who care.</p><button className="hp-button" type="button" onClick={props.startDraft}>Start a petition</button></div>
        <div className="hp-how-it-works"><h3>From idea to action</h3><ol><li><strong>Make a clear ask</strong><span>One change you'd like to see.</span></li><li><strong>Bring people together</strong><span>Share it with your classmates.</span></li><li><strong>Take it to the right people</strong><span>Show what your campus cares about.</span></li></ol></div>
      </aside>
    </div>
  )
}

export function CauseExplorer(props: VariantProps) {
  const selected = props.petitions.find((petition) => petition.id === props.selectedId) ?? props.petitions[0]
  return (
    <div className="hp-explorer">
      <section className="hp-explorer-heading"><p>A little care can go a long way.</p><h1>What would make<br />your campus better?</h1><p>Pick something that matters to you.<br />Find the people who feel it too.</p><Filters {...props} /></section>
      <section className="hp-explorer-browser" id="prototype-petitions">
        <div className="hp-explorer-list"><div className="hp-explorer-list-heading"><h2>Find your people</h2><span>{props.petitions.length} petitions</span></div><Search {...props} />
          {props.petitions.map((petition) => <button key={petition.id} type="button" className="hp-explorer-option" aria-pressed={selected?.id === petition.id} onClick={() => props.setSelectedId(petition.id)}><span>{petition.category}</span><h3>{petition.title}</h3><span>{petition.signatures + Number(props.signed.includes(petition.id))} students care about this</span></button>)}
          {props.petitions.length === 0 ? <EmptyResults {...props} /> : null}
        </div>
        {selected ? <article className="hp-explorer-detail" aria-live="polite"><div className="hp-explorer-detail-top"><span>{selected.category}</span><span className="hp-round-mark" aria-hidden="true">✳</span></div><h2>{selected.title}</h2><p>{selected.description}</p><div className="hp-author"><span className="hp-avatar">{selected.initials}</span><div><strong>{selected.author}</strong><span>Started this conversation</span></div></div><div className="hp-explorer-detail-footer"><Progress petition={selected} signed={props.signed.includes(selected.id)} /><button id="prototype-explorer-sign" className="hp-button" type="button" onClick={() => props.openPetition(selected.id)}>{props.signed.includes(selected.id) ? "View your support" : "I'm in. Add my voice."}</button></div></article> : <div className="hp-explorer-detail hp-explorer-no-selection"><h2>There's room for your idea.</h2><p>Try another cause, or start the conversation yourself.</p><button className="hp-button" type="button" onClick={props.startDraft}>Start a petition</button></div>}
      </section>
      <div className="hp-explorer-invitation"><p>Don't see the change you're looking for?</p><button type="button" onClick={props.startDraft}>Be the one who starts it.</button></div>
    </div>
  )
}

export function HomePrototype({ petitions, queryStatus }: { petitions: PetitionContent[]; queryStatus: string }) {
  const [params] = useSearchParams()
  const rawVariant = params.get("variant")?.toUpperCase()
  const variant = homeVariants.some((item) => item.key === rawVariant) ? rawVariant! : "D"
  const LandingVariant = publicLandingVariants[variant]
  const [landingIdea, setLandingIdea] = useState(0)
  const [category, setCategory] = useState("All causes")
  const [search, setSearch] = useState("")
  const [signed, setSigned] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftSaved, setDraftSaved] = useState(false)
  const petitionDialog = useRef<HTMLDialogElement>(null)
  const draftDialog = useRef<HTMLDialogElement>(null)
  // Preserve fetched titles/descriptions; only unprovided presentation metadata is illustrative.
  const allPetitions = petitions.length > 0
    ? petitions.map((petition, index) => ({ ...samplePetitions[index % samplePetitions.length], ...petition }))
    : samplePetitions
  const filtered = allPetitions.filter((petition) =>
    (category === "All causes" || petition.category === category) &&
    `${petition.title} ${petition.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
  const active = allPetitions.find((petition) => petition.id === activeId)
  function startLandingDraft(title?: string) {
    if (title) setDraftTitle(title)
    setDraftSaved(false)
    draftDialog.current?.showModal()
  }
  const props: VariantProps = {
    allPetitions, petitions: filtered, category, setCategory, search, setSearch, signed, selectedId, setSelectedId,
    openPetition: (id) => { setActiveId(id); petitionDialog.current?.showModal() },
    startDraft: () => { setDraftSaved(false); draftDialog.current?.showModal() },
  }

  return (
    <div className={`home-prototype hp-variant-${variant}`} id="home-prototype">
      {LandingVariant ? (
        <LandingVariant idea={landingIdea} setIdea={setLandingIdea} startDraft={startLandingDraft} />
      ) : (
        <>
          {variant === "A" ? <CampaignHeader startDraft={props.startDraft} /> : variant === "B" ? <BoardHeader startDraft={props.startDraft} /> : <ExplorerHeader startDraft={props.startDraft} />}
          <div className="hp-preview-note">Design preview <span>{petitions.length > 0 ? "Live petition text; sample people, causes, and counts." : "Sample petitions and counts."} Actions stay in this browser tab.</span></div>
          {variant === "A" ? <CampaignPoster {...props} /> : variant === "B" ? <CampusBoard {...props} /> : <CauseExplorer {...props} />}
        </>
      )}
      <dialog ref={petitionDialog} id="prototype-petition-dialog" className="hp-dialog" aria-labelledby="prototype-petition-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        {active ? <><button type="button" className="hp-dialog-close" aria-label="Close petition" onClick={() => petitionDialog.current?.close()}>×</button><p className="hp-dialog-note">Preview petition</p><h2 id="prototype-petition-title">{active.title}</h2><p>{active.description}</p><Progress petition={active} signed={signed.includes(active.id)} /><button type="button" id="prototype-sign" className="hp-button" disabled={signed.includes(active.id)} onClick={() => setSigned((previous) => previous.includes(active.id) ? previous : [...previous, active.id])}>{signed.includes(active.id) ? "You're on the list" : "Add my signature"}</button><p role="status" className="hp-dialog-note">{signed.includes(active.id) ? "Your preview signature was added. Nothing was sent or saved." : "Try signing. This preview does not submit a real signature."}</p></> : null}
      </dialog>
      <dialog ref={draftDialog} id="prototype-draft-dialog" className="hp-dialog" aria-labelledby="prototype-draft-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        <button type="button" className="hp-dialog-close" aria-label="Close draft" onClick={() => draftDialog.current?.close()}>×</button><p className="hp-dialog-note">Try your idea</p><h2 id="prototype-draft-title">What should change?</h2><p>A clear, specific ask is a good place to start.</p><form id="prototype-draft-form" onSubmit={(event) => { event.preventDefault(); if (draftTitle.trim()) setDraftSaved(true) }}><label htmlFor="prototype-draft-input">Petition title</label><input id="prototype-draft-input" placeholder="Keep the library open until midnight" required maxLength={150} value={draftTitle} onChange={(event) => { setDraftTitle(event.target.value); setDraftSaved(false) }} /><button type="submit" className="hp-button">Preview my idea</button></form><p className="hp-dialog-note" role="status">{draftSaved ? `Draft preview: “${draftTitle.trim()}”. Kept in this tab only.` : "This is a local draft. It won't be published."}</p>
      </dialog>
      <PrototypeSwitcher current={variant} state={LandingVariant ? { question: "How should PetitionU introduce itself before the app?", content: "Public landing page with illustrative examples", queryStatus, landingIdea: landingIdeas[landingIdea], draftTitle, draftSaved } : { question: "Campaign, feed, or cause-first discovery?", queryStatus, data: petitions.length ? "Live text, sample metadata" : "Sample content", category, search, visiblePetitions: filtered.map(({ id, title }) => ({ id, title })), selectedId: filtered.find((petition) => petition.id === selectedId)?.id ?? filtered[0]?.id ?? null, signed, activeId, draftTitle, draftSaved }} />
    </div>
  )
}

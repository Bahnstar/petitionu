import { Link } from "react-router-dom"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function CommunityRulesPage() {
  useDocumentTitle("Community rules")
  return <main className="app-page max-w-3xl space-y-8">
    <header className="space-y-3"><h1 className="text-3xl font-semibold">Community rules</h1><p className="text-muted-foreground">Make room for students to disagree, organize, and be heard.</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Keep the discussion useful</h2><p>Describe the change you want and explain why it matters. Do not post spam, impersonate someone else, or misrepresent support for a petition.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Respect people and their privacy</h2><p>Critique ideas and decisions without harassment or threats. Do not share someone else's private information or encourage others to target them.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Report concerns</h2><p>Use the report control on a petition or comment to flag spam, harassment, privacy concerns, or another issue. Reporting requires a confirmed account and completed campus profile. Explain the concern so a moderator can assess it.</p><p>Moderators can dismiss a report or resolve it with a recorded decision. They can hide reported content. A hidden petition and its discussion are no longer available for participation.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Get help</h2><p>For an account problem or a question about a moderation decision, <Link to="/support" className="underline">contact support</Link>. This service is not an emergency response channel.</p></section>
  </main>
}

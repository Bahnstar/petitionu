import { Link } from "react-router-dom"
import { useDocumentTitle } from "../hooks/use-document-title"

export default function PrivacyPage() {
  useDocumentTitle("Privacy")
  return <main className="app-page max-w-3xl space-y-8">
    <header className="space-y-3"><h1 className="text-3xl font-semibold">Privacy on PetitionU</h1><p className="text-muted-foreground">What the application stores and who can see it.</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Your account</h2><p>PetitionU stores your email address, profile information, campus association, and sign-in records. Your confirmed email domain connects your account to a supported campus.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Petitions and participation</h2><p>Public petitions can be read without signing in. Classroom petitions are limited to the professor and active classroom members. PetitionU stores petitions, signatures, comments, and updates with their account relationships.</p><p>An anonymous petition hides its author's name from other readers. It does not remove the account relationship from stored records. Signature counts are visible with a petition, while individual signer identity is restricted. Avoid posting personal information you do not want your audience to see.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Reports and support</h2><p>Content reports include a copy of the reported content, your explanation, and an account reference. Reporters and authorized moderators can read reports. Campus administrators review reports for their campus, and platform operators can review reports across campuses.</p><p>Support and account-deletion requests store your message, email address, and review history. You and authorized operators can read these requests. Requests from accounts without a campus are handled by platform operators.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Account deletion and questions</h2><p>You can <Link to="/support" className="underline">submit an account-deletion request or contact support</Link>. Submitting or resolving a request does not automatically delete your account or content. An operator records the outcome of the review in your request.</p></section>
  </main>
}

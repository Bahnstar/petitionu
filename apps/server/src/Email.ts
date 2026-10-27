/**
 * Email templates, ported from the Elixir senders. Links always use HTTPS and the
 * configured public host; callers pass the path. User content is HTML-escaped.
 */

export interface Email {
  readonly to: string
  readonly subject: string
  readonly html: string
}

interface LinkEmailInput {
  /** The public host name (`PUBLIC_HOST`), without scheme or port. */
  readonly publicHost: string
  readonly to: string
  /** Path of the link, starting with `/`. */
  readonly path: string
}

interface ClassroomEmailInput {
  readonly publicHost: string
  readonly to: string
  readonly firstName: string | null | undefined
  readonly classroom: { readonly name: string; readonly description?: string | null | undefined }
}

const escapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export const escapeHtml = (value: string) => value.replaceAll(/[&<>"']/g, (c) => escapes[c]!)

export const emailUrl = (publicHost: string, path: string) => `https://${publicHost}${path}`

const linkBody = (lead: string, url: string) => `<p>${lead}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
`

export const confirmationEmail = (input: LinkEmailInput): Email => ({
  to: input.to,
  subject: "Confirm your email address",
  html: linkBody("Click this link to confirm your email:", emailUrl(input.publicHost, input.path)),
})

export const passwordResetEmail = (input: LinkEmailInput): Email => ({
  to: input.to,
  subject: "Reset your password",
  html: linkBody("Click this link to reset your password:", emailUrl(input.publicHost, input.path)),
})

export const magicLinkEmail = (input: LinkEmailInput): Email => ({
  to: input.to,
  subject: "Your login link",
  html: linkBody(
    `Hello, ${escapeHtml(input.to)}! Click this link to sign in:`,
    emailUrl(input.publicHost, input.path),
  ),
})

const hello = (firstName: string | null | undefined) =>
  firstName == null ? "Hello!" : `Hello ${escapeHtml(firstName)}!`

const appButton = (publicHost: string, label: string) => `<p style="margin-top: 20px;">
    <a href="${escapeHtml(emailUrl(publicHost, "/"))}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
      ${label}
    </a>
  </p>`

const inviterName = (
  invitedBy:
    | {
        readonly firstName?: string | null | undefined
        readonly lastName?: string | null | undefined
      }
    | null
    | undefined,
) => {
  const name = `${invitedBy?.firstName ?? ""} ${invitedBy?.lastName ?? ""}`.trim()
  return name === "" ? "A professor" : name
}

export const classroomInviteEmail = (
  input: ClassroomEmailInput & {
    readonly invitedBy?: Parameters<typeof inviterName>[0]
  },
): Email => {
  const { classroom } = input
  const description =
    classroom.description == null ? "" : `<p><em>${escapeHtml(classroom.description)}</em></p>`
  return {
    to: input.to,
    subject: `You've been invited to join ${classroom.name}`,
    html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Classroom Invitation</h2>
  <p>${hello(input.firstName)}</p>
  <p>${escapeHtml(inviterName(input.invitedBy))} has invited you to join the classroom <strong>${escapeHtml(classroom.name)}</strong> on PetitionU.</p>
  ${description}
  <p>Your membership is pending. Your professor will approve access before you can view classroom petitions. Sign in to PetitionU to check your classrooms.</p>
  ${appButton(input.publicHost, "Go to PetitionU")}
</div>
`,
  }
}

export const membershipApprovalEmail = (input: ClassroomEmailInput): Email => {
  const name = escapeHtml(input.classroom.name)
  return {
    to: input.to,
    subject: `You've been approved to join ${input.classroom.name}`,
    html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Welcome to ${name}!</h2>
  <p>${hello(input.firstName)}</p>
  <p>Great news! Your request to join <strong>${name}</strong> has been approved.</p>
  <p>You can now:</p>
  <ul>
    <li>View and sign petitions in this classroom</li>
    <li>Comment on classroom petitions</li>
    <li>Create new petitions (if enabled by your professor)</li>
  </ul>
  ${appButton(input.publicHost, "Go to Classroom")}
</div>
`,
  }
}

# Moderation and support

Signed-in students with a confirmed email and completed campus profile can report a petition or comment that they can currently read. Reports accept spam, harassment, privacy, or other concerns. Details are limited to 5,000 characters. A comment report derives its petition from the visible comment, ignoring a supplied petition ID.

The report stores its reporter, campus, content snapshot, and target IDs. Reporters can read their submissions. Campus admins can read and resolve reports for their own campus. Superadmins can handle all reports, including historical targets without a campus. Other admins cannot handle campus-less reports.

## Review a report

1. Open `/moderation` and choose Content reports.
2. Read the concern and expand Content when reported. The copy reflects what was submitted, even if the author later edits the content.
3. Choose Resolve or Dismiss and write a decision note. The reporter can read that note.
4. For a resolved report, select Hide reported content when removal from ordinary views is appropriate.
5. Save the decision. Include reviewed shows earlier decisions.

Hiding and report resolution share a transaction. Petition hiding blocks ordinary petition reads and child content and participation. Comment hiding removes that comment and blocks changes to it. This does not physically delete content. There is no restore action in this MVP. A reviewed report cannot be overwritten through the resolution action. The record keeps the resolver, time, and note.

Moderators can inspect the submitted copy even when they are not classroom members. The ordinary petition link still follows classroom visibility. Copies of private content remain limited to the reporter and authorized moderators.

## Handle support and account-deletion requests

`/support` offers the configured support email to guests. Authenticated users can persist support or account-deletion requests and follow their status. This path also works before email confirmation or campus matching, so account setup problems can reach an operator.

The Support requests queue includes the requester's email. Contact that address outside the application when needed. Review account-deletion requests manually and determine the appropriate action before recording the outcome. Saving a resolution does not send email, delete an account, or delete content. Describe only actions actually taken. The requester can read the resolution note.

Campus admins handle requests captured for their campus. Superadmins handle requests without a campus and can handle any campus. Resolved requests cannot be overwritten by another resolution. The request keeps its original account and campus association, message, email, resolver, time, and note.

Production requires `SUPPORT_EMAIL` through the existing runtime mail configuration. No response time is promised by the application.

## Integration

Post registers `Petitionu.Post.ContentReport` and exposes `get_content_reports`, `create_content_report`, and `resolve_content_report`. Accounts registers `Petitionu.Accounts.SupportRequest` and exposes `get_support_requests`, `get_my_support_requests`, `create_support_request`, `resolve_support_request`, and `support_contact`.

The petition and comment `moderator_hide` actions are guarded server actions and are not exposed through RPC. Public target IDs and snapshots belong to the report. Reporter and resolver relationships are private.

React pages default-export from `moderation-page.tsx`, `support-page.tsx`, `privacy-page.tsx`, and `community-rules-page.tsx`. Mount them at `/moderation`, `/support`, `/privacy`, and `/community-rules`.

```tsx
import { ReportContent } from "../moderation/report-content"

<ReportContent petitionId={petition.id} />
<ReportContent petitionId={petition.id} commentId={comment.id} />
```

Regenerate the Ash RPC client and migrations after registering the resources. Run `MIX_TEST_PARTITION=_moderation mix test test/petitionu/post/moderation_test.exs` for the focused authorization and persistence checks.

# Spec: Rewrite the PetitionU backend on Effect 4

## Problem Statement

PetitionU's backend is about 5k lines of Elixir on Phoenix and Ash. The rest of the product is TypeScript: a React 19 single-page app built with Bun, oxlint/oxfmt and TypeScript. Today the two halves talk through a generated client (`ash_rpc.ts`). Every backend change needs Elixir, the Ash DSLs and code generation, and the people maintaining the project spend most of their time in TypeScript. Elixir can't run on the main development host, so a backend change can't even be run locally there.

The sign-in, registration, password reset, email confirmation and magic-link screens are server-rendered LiveViews that look and behave differently from the rest of the app. Background work goes through Oban, and authorization is spread across Ash policy DSLs. A TypeScript maintainer can't easily read or test either of them.

From the team's point of view, the backend should be TypeScript that shares types directly with the React app, runs and tests on the development host, and keeps every behaviour students, professors and campus admins rely on today. Production data has to stay where it is.

## Solution

Replace the Elixir backend with a TypeScript server built on Effect 4. It keeps the existing Postgres database and runs against it in place. Users notice two things:

- Sign-in, registration, password reset, email confirmation and magic-link sign-in move into the React app and look like the rest of it.
- Everyone signs in once more after cutover, because existing sessions don't carry over.

Everything else behaves the same: browsing and signing petitions, comments, updates, classrooms and memberships, moderation, support requests, campus assignment and school verification.

The main choices:

- **Runtime:** Node 24 LTS. Bun stays as the package manager and frontend toolchain.
- **Version:** Effect 4.0.x, pinned exactly.
- **HTTP:** Effect's HTTP server.
- **API:** Effect RPC with fixed response shapes (DTOs) per procedure.
- **Database:** the first-party Effect SQL Postgres client with hand-written SQL.
- **Authentication:** Better Auth, mounted inside the Effect server.
- **Background jobs:** Effect's SQL-backed persisted queue.
- **Email:** Resend over HTTP.
- **Deployment:** a new Docker Compose file, alongside the existing Railway configuration.

## User Stories

### Visitors (signed out)

1. As a visitor, I want to open the home page and browse the public landing content, so that I can understand what PetitionU is before signing up.
2. As a visitor, I want to open a shared link to a public petition and see its title, description, status, goal, signature count, days left, category and author, so that I can decide whether to sign up and sign it.
3. As a visitor, I want activity details on a shared petition (signatures, comments, updates) to stay hidden until I sign in, so that students' participation isn't exposed publicly.
4. As a visitor trying to open the petitions list, I want to be sent to sign-in and then returned to the list afterwards, so that I don't lose my place.
5. As a visitor, I want to see the support contact address, so that I can get help before I have an account.
6. As a visitor, I want to see the community rules and privacy pages, so that I know the expectations before joining.

### Registration, sign-in and account security

7. As a new student, I want to register with my email and a password of at least 8 characters, confirmed by typing it twice, so that I can create an account.
8. As a new student, I want to get a confirmation email when I register, so that I can prove I own my school address.
9. As a new student, I want the confirmation link to open a page where I click to confirm, rather than being confirmed just by loading the link, so that email security scanners can't confirm or sign me in by accident.
10. As a student, I want confirming my email to put me on my campus automatically when my email domain matches a supported school, so that I can take part right away.
11. As a student whose school domain is still pending verification, I want my campus to activate on its own once the school is verified, so that I don't have to contact support.
12. As a returning student, I want to sign in with email and password, so that I can get back to my petitions.
13. As a student, I want to ask for a magic sign-in link by email, so that I can sign in without a password.
14. As a new student, I want a magic link to create my account if I don't have one yet, so that I can sign up without choosing a password.
15. As a student, I want the magic link to open a page where I click to sign in, so that link scanners can't use it up.
16. As a student, I want signing in with a magic link to count as confirming my email, so that I don't have to confirm separately.
17. As a student who forgot my password, I want to request a reset email, so that I can get back into my account.
18. As a student, I want the reset page to let me set a new password and sign me in, and to count as confirming my email, so that recovery is a single step.
19. As a student, I want a password reset or change to sign me out on every other device, so that someone who knew my old password loses access.
20. As a signed-in student, I want to change my password by entering my current one and the new one twice, so that I can keep my account secure. If I only ever signed in with emailed links, I want the profile to offer a link to set a password instead, so that I'm not shown a form I can't use.
21. As a signed-in student, I want to sign out, so that my session ends on a shared computer.
22. As a student, I want links in reset, confirmation and magic-link emails to expire and only work once, so that an old email can't be used to get into my account.
23. As a student, I want repeated sign-in or reset attempts to be rate-limited, so that attackers can't guess my password or flood my inbox.
24. As an existing user from before the rewrite, I want my current password to keep working, so that the migration doesn't lock me out.
25. As any user, I want requesting a reset or magic link not to reveal whether an email is registered, so that attackers can't list accounts.
26. As a user, I want sign-in to return me to the page I was trying to reach, so that I can carry on where I was.

### Profile and campus

27. As a signed-in student, I want to see my profile, including email, name, role, graduation year, whether my email is verified, whether my profile is complete, my campus, and whether I have a password, so that I know my account status.
28. As a confirmed student, I want to fill in my first name, last name and graduation year (between 1900 and 2100), so that my profile is complete.
29. As a confirmed student without a campus, I want completing my profile to match me to my campus by email domain, and to tell me to contact support if there's no single supported match, so that I'm not stuck.
30. As an unconfirmed student, I want a clear message that I must confirm my email before completing my profile, so that I know what to do next.
31. As a student, I want to see my own stats (petitions created, petitions signed, total signatures on my petitions), and I want them hidden from other users, so that my activity stays private.
32. As a student, I want my email, role, graduation year and campus to be visible only to me and my campus admins, so that other students can't collect my personal details.

### Petitions

33. As a student with a complete profile, I want to create a campus petition with a title, description, category, goal, optional deadline, comment setting and anonymity setting, so that I can rally support.
34. As a student, I want a petition's deadline to have to be in the future, so that I don't publish something already expired.
35. As a student, I want unconfirmed or incomplete accounts to get a clear message instead of being allowed to create or sign petitions, so that I understand what's required.
36. As a student, I want my petition tied to my campus automatically, so that the right community sees it.
37. As a signed-in student, I want to browse public petitions with signature counts, days left, whether they're trending, and whether I've signed, so that I can find causes to support.
38. As an author who chose anonymity, I want my name hidden from other users on my petition, so that I can raise sensitive issues safely.
39. As a petition author, I want to edit, close or mark my petition as a victory, so that its status reflects what happened.
40. As a petition author, I want to publish updates on my petition, so that supporters know about progress.
41. As a signed-in student, I want to read a petition's updates newest first, so that I see the latest progress.
42. As a student, I want hidden (moderated) petitions to disappear from every list and detail view, and to block any further changes, so that removed content stays removed.

### Signatures and comments

43. As a student on the right campus, I want to sign an open petition once, optionally with a reason, so that my support counts, and to withdraw my own signature while the petition still takes signatures, so that I can change my mind.
44. As a student, I want to be stopped from signing a closed petition, one past its deadline, or one from another campus that doesn't accept outside signatures, so that the rules are applied consistently.
45. As a student, I want concurrent signing to never produce duplicate signatures or race past a petition closing, so that counts stay accurate.
46. As a student, I want to comment on an open petition that allows comments, and reply to existing comments, so that I can discuss the issue.
47. As a commenter, I want to edit or delete my own comment, so that I can fix mistakes.
48. As a student, I want hidden comments, and comments on hidden petitions, to disappear, so that moderation works.

### Classrooms

49. As a professor or admin, I want to create a classroom on my campus with a join code, so that my students can take part privately.
50. As a professor, I want to edit, archive, unarchive and regenerate the join code of my own classroom, so that I control who gets in.
51. As a confirmed student, I want to join a classroom with its join code and become an active member right away, so that I can start quickly.
52. As a student, I want an archived classroom's join code to be rejected, so that closed classes stay closed.
53. As a student, I want to request to join a classroom and wait for approval, so that the professor can vet members.
54. As a professor, I want to invite a registered user by email as a student or TA, and have them get an invite email, so that I can bring people in directly.
55. As a TA, I want to invite students (but not TAs) and approve pending requests, so that I can help run the classroom.
56. As an approved member, I want an approval email, so that I know I've been let in.
57. As a professor, I want to promote a student to TA and demote a TA to student, so that I can delegate work.
58. As a professor or TA, I want to remove members, and as a student I want to leave a classroom I'm in, so that membership stays accurate.
59. As a classroom member, I want to see the classrooms I belong to or teach, paginated, so that I can get to them quickly.
60. As a professor or TA, I want to see a classroom's members and its pending requests, so that I can manage admissions.
61. As a classroom member, I want to create and see classroom petitions that only the professor and active members can see, so that class discussions stay private.
62. As a professor, I want to choose whether students may create classroom petitions, so that I control what gets posted in my class.
63. As a student, I want signatures, comments and updates to be refused on petitions in archived classrooms, so that archived classes are read-only.

### Moderation and support

64. As a student, I want to report a petition or comment for spam, harassment, privacy or another reason, with optional details, so that moderators can review it.
65. As a reporter, I want to see the reports I've filed and what happened to them, so that I know they were handled.
66. As a campus admin, I want to see and resolve or dismiss reports for my campus, with a resolution note, and optionally hide the reported content, so that I can keep my community safe.
67. As a campus admin, I want dismissing a report to never hide content, and an already-reviewed report to be impossible to resolve again, so that moderation stays consistent.
68. As a superadmin, I want to moderate reports and support requests across all campuses, so that I can step in anywhere.
69. As a student, I want to send a support request or an account deletion request, and see my own requests, so that I can get help.
70. As a campus admin, I want to see and resolve support requests from my campus with a note, so that students get answers.
71. As a campus admin, I want to list users on my campus and change their roles (but never to or from superadmin), so that I can appoint professors and admins.
72. As a superadmin, I want to assign any role, including superadmin, so that I can manage the platform.
73. As a signed-in user, I want to see my notifications and preferences, so that I stay informed.

### Operators and developers

74. As an operator, I want the new server to run against the existing production database without moving data, so that cutover is low risk.
75. As an operator, I want migrations to run once per deploy in a separate step before the app starts, so that schema changes are predictable.
76. As an operator, I want a Docker Compose stack with the app, Postgres 17, a one-shot migrate job and a Cloudflare Tunnel, so that I can self-host with a single command.
77. As an operator, I want the Railway deployment to keep working with the same pre-deploy migrate step and health check, so that I can choose either host.
78. As an operator, I want the server to refuse to start when required configuration is missing or invalid (database URL, secrets, Resend key, sender and support addresses, public host), so that a bad deploy fails loudly.
79. As an operator, I want `/healthz` to return 200 when the database is reachable and 503 without leaking details when it isn't, so that monitors and the platform can check health.
80. As an operator, I want structured JSON logs with request spans and optional OpenTelemetry export, and never tokens, full email links or credentials, so that I can debug without leaking secrets.
81. As an operator, I want school verification jobs to survive restarts, retry with capped exponential backoff, and never be queued twice for the same user, so that verification is reliable.
82. As an operator, I want the existing backup, restore and smoke scripts to keep working against the unchanged schema, so that recovery procedures stay valid.
83. As a developer, I want the server, client and React app to share one set of schemas for inputs, outputs and errors, so that a contract change is a type error everywhere at once.
84. As a developer, I want to run the server, frontend dev server and tests on the development host without Elixir, so that I can work locally.
85. As a developer, I want the React app's data fetching to keep using TanStack Query with the same success/error result shape, so that porting call sites is mechanical.
86. As a developer, I want every state-changing request to be protected against CSRF, so that another site can't act on a signed-in user's behalf.
87. As a developer, I want authorization rules written as plain, readable functions and SQL filters next to each feature, so that I can review who can do what without learning a DSL.

## Implementation Decisions

### Platform and versions

- Target Effect 4.0.x (the first stable v4 line, an LTS release), pinned to an exact version along with all `@effect/*` packages. The HTTP, HTTP API, RPC, SQL, persistence, cluster and workflow modules, and the Postgres driver package, are all tagged `@stability unstable` in 4.0.x, so they can break in minor releases. Upgrades are deliberate, single-purpose changes.
- The server runtime is Node 24 LTS with the Effect Node platform. Bun is the package manager, workspace tool and frontend toolchain.
- The repo becomes a Bun workspace with three packages:
  - **domain:** shared schemas, errors, RPC definitions and the browser client wrapper.
  - **server:** the Effect application, auth, policies, queue and migrations.
  - **web:** the existing React app, moved here.
  The Elixir application is removed on this branch.
- The React app switches from mix-driven esbuild and Tailwind to Vite with the Tailwind v4 Vite plugin. In development, Vite proxies `/rpc`, the auth routes and `/healthz` to the server.

### Server composition

- A single HTTP router serves:
  - the RPC endpoint (`POST /rpc`);
  - the Better Auth handler under `/api/auth/*`, mounted by adapting its web handler into the Effect router;
  - `/healthz`;
  - built static assets;
  - the HTML shell for every SPA route. The shell carries the CSRF meta tag.
- The existing SPA URL structure (the `/ash-typescript/*` prefix and the `/` redirect) stays for now. Renaming it is a separate change.
- Server-rendered behaviour that moves into the SPA shell route: an unauthenticated request for the petitions list is redirected to sign-in, with the return path remembered.
- Services are Effect Layers: database client, Better Auth instance, Mailer, SchoolRegistry, job queue, config, and a current-actor context. Tests replace Mailer and SchoolRegistry.

### Database and migrations

- Keep the existing Postgres schema in place: all current tables, `citext` columns, the `ash-functions` SQL functions, UUID v7 keys and defaults. Data stays where it is.
- The Effect Postgres migrator owns migrations from now on, in its own migrations table. Migration 0001 is a baseline matching the current schema, produced from a schema-only dump of the latest Ecto state. It does nothing when it detects that the latest Ecto migration (`20260908050000`) has been applied, and creates the full schema on an empty database (for tests and new installs). Ecto's migrations table is left frozen and never written again.
- Additive migrations for Better Auth (no existing column is renamed or dropped):
  - `users` gains an `email_verified` boolean, backfilled from `confirmed_at IS NOT NULL`, plus the columns Better Auth requires that are missing (a display `name` with a non-null default, and a nullable `image`). Better Auth's field mapping points its `createdAt` and `updatedAt` at the existing `inserted_at` and `updated_at`.
  - New `account`, `session` and `verification` tables, with snake_case columns and foreign keys to `users`.
  - A backfill creates one credential `account` row per user that has a `hashed_password`, copying the bcrypt hash unchanged.
- `confirmed_at` stays the domain's source of truth for confirmation. Better Auth database hooks set `confirmed_at` whenever `email_verified` becomes true, so `confirmed_at`, `email_verified` and the participation checks never disagree.
- Migration 0004 adds `comment.deleted_at`. Deleting a comment keeps the row (content reports reference it through a foreign key with no `ON DELETE`, and replies through `parent_comment_id`), sets `deleted_at` and clears the text. Deleted comments drop out of every read, like hidden ones, and can't be replied to, edited or reported; report snapshots keep the reported text.
- Legacy objects are kept but no longer used: `tokens`, `users.hashed_password` and `oban_jobs`. Dropping them comes later (see Out of Scope).
- Data access is hand-written SQL through the Effect SQL client, with Schema-decoded rows. Ash calculations become SQL expressions or subqueries:
  - `signatures_count`, `has_signed`, `can_manage` and `trending` (more than 5 signatures and at least 50% of the goal);
  - `days_left` (30 days from creation when there's no deadline, otherwise days until the deadline);
  - `author` (with anonymity), `email_verified` and `profile_complete`;
  - the user activity stats.
- Writes that Ash protected with row locks keep them. Signature, comment and update creation lock the petition row (`FOR UPDATE`) inside a transaction before checking it is open, its deadline, comment settings, campus and whether its classroom is archived. Withdrawing a signature takes the same lock and the same checks with the same messages, except the campus check: a signer may withdraw after their campus stops qualifying. Report resolution locks the report row. Signature uniqueness is still enforced by the existing unique index on petition and user.

### Authentication (Better Auth)

- One Better Auth instance, configured on the server and backed by the same Postgres database. Better Auth's own pool is small and separate, because its adapter isn't the Effect SQL client. The `users` table is mapped as Better Auth's user model, with UUID IDs to match the existing primary keys.
- **Email and password:**
  - Minimum length 8. Password confirmation is checked in the React form and in a Better Auth before-hook.
  - Hashing and verification are overridden to use bcrypt, so existing hashes verify and new hashes use the same format.
  - Reset emails are enabled and reset revokes all sessions.
  - Changing a password requires the current password and revokes other sessions.
- **Email verification:** a confirmation email is sent on sign-up. Unverified users may sign in; taking part (petitions, signatures, comments, classrooms, reports) stays blocked by the domain's existing confirmed-and-complete-profile rule. The verification URL in the email points to an SPA confirm page. That page calls Better Auth's verify endpoint only when the user clicks Confirm, which keeps `require_interaction`.
- **Magic link:** the Better Auth magic-link plugin, with sign-up through magic link allowed. The emailed URL points to an SPA page that calls the plugin's verify endpoint only after a click. A successful magic-link sign-in marks the email verified.
- Reset password and magic-link sign-in also count as confirming the email, matching the current `auto_confirm_actions`.
- **Campus assignment:** whenever a user becomes confirmed (email verification, magic-link sign-in or password reset), a Better Auth after-hook runs the domain's `AssignOrganization` workflow through the server's Effect runtime. If an approved or verified organization matches the email domain, the user is assigned to it. Otherwise one is created or found for a school domain, and the user is set as pending with a verification job queued.
- **Sessions:** Better Auth's cookie sessions (HttpOnly, Secure in production, SameSite=Lax). Revoking means deleting session rows. Sign-out removes the current session.
- Better Auth's built-in rate limiting, stored in the database, covers sign-in, sign-up, reset, magic-link and verification endpoints.
- Reset and magic-link requests always return the same success response whether or not the email exists.
- Better Auth's email callbacks (verification, reset, magic link) send through the domain Mailer service, using text templates ported from the current senders.
- **Current actor:** RPC middleware resolves the Better Auth session from request headers, loads the domain user row with SQL, and provides a `CurrentActor` service: either signed in (with id, role, organization, confirmation, profile names and email) or a guest. Procedures declare whether they're public or need a signed-in user.
- Better Auth's `trustedOrigins` contains only the public host (and the dev origin in development). The server and SPA share an origin, so no CORS configuration is needed.

### Authorization

- Each feature area has a policy module with two kinds of functions:
  - **Read-scoping functions** that return SQL filter fragments for the current actor. Examples: petitions visible when not hidden and either public, or in a classroom the actor teaches or is an active member of. Users visible to themselves, to superadmins, and to admins of the same organization.
  - **Decision functions** for writes that load the target and either succeed or fail with a typed `Forbidden` error.
- Every rule in today's Ash policies is ported one for one, including:
  - moderation hide (superadmin, or admin of the content's organization);
  - classroom management (professor only);
  - membership invite and approve (professor or active TA; TAs invite students only; approve only pending requests in non-archived classrooms);
  - promote, demote and delete (professor only);
  - remove (professor, active TA, or a student leaving);
  - `set_role` (superadmin for anything; admin only for non-superadmins in their own organization, and never granting superadmin);
  - support request and report read and resolve (owner, superadmin, or admin of the same organization);
  - comment edit and delete (the author only; the comment and its petition visible to them and not hidden; a comment they can't see is `NotFound`, someone else's `Forbidden`). Archived classrooms are read-only, so comments there can't be changed either. Edits are checked like new comments; closed petitions don't block them;
  - the participation validation messages, which are kept word for word.
- Field policies on `User` become separate response schemas, chosen by policy:
  - a public user shape (id, names);
  - a self or admin shape that adds email, role, graduation year, organization, email verified and profile complete;
  - a self-only stats shape for petition, signature and supporter counts.
- Ash relationship filters that scoped related lists to the actor (a user's petitions and signatures) become explicit actor filters in SQL.

### RPC API contract

- One Effect RPC group in the shared domain package. The JSON serialization runs over HTTP at `POST /rpc`. Procedures keep today's camelCase names so the frontend recognizes them:
  - **Accounts:** getMe, getUserById, getUsers, updateMyProfile, setUserRole, getOrganizations, getPreferences, getNotifications, createSupportRequest, getMySupportRequests, getSupportRequests, resolveSupportRequest, supportContact.
  - **Petitions:** getPetitions, getPublicPetitions, getPetitionById, createPetition, createClassroomPetition, getClassroomPetitions, updatePetition, closePetition, markPetitionVictory, getCategories.
  - **Participation:** createSignature, deleteSignature, getSignatures, createComment, updateComment, deleteComment, getComments, createUpdate, getUpdates, getUpdatesForPetition.
  - **Classrooms:** getClassrooms, getClassroomById, getMyClassrooms (offset pagination with total count), createClassroom, updateClassroom, archiveClassroom, unarchiveClassroom, regenerateJoinCode, getClassroomMemberships, getMembershipsForClassroom, getPendingMemberships, joinClassroomByCode, requestToJoinClassroom, inviteToClassroom, approveMembership, removeFromClassroom, promoteToTa, demoteToStudent.
  - **Moderation:** createContentReport, getContentReports, resolveContentReport.
- Each procedure has a fixed input schema and a fixed output DTO. Client-side field selection (`fields: [...]`) is dropped. Each DTO is defined as the union of what the frontend currently asks for at that call site, so no screen loses data. A procedure with call sites that need different depths gets one DTO covering all of them; these differences are small.
- Guest access to petitions becomes an explicit contract:
  - `getPetitionById` is public and returns a shared-petition DTO to guests (the shared fields allowed today: id, title, description, status, classroom and organization IDs, has-signed, can-manage, goal, signature count, days left, trending, author, comment and anonymity flags, deadline, created-at, and the category's id and name). Signed-in actors get the full petition DTO.
  - Petition list, signature, comment and update procedures require a signed-in user. A guest calling them gets a typed `Unauthenticated` error with the current message, "Sign in to access petition activity."
- The errors are Schema-tagged and shared: `Unauthenticated`, `Forbidden`, `NotFound`, and `Invalid`, which carries per-field messages.
- The shared browser client wraps the Effect RPC client in plain promise functions that return the frontend's existing result shape. That shape is either success with data, or failure with a list of errors that each have a type (`not_found`, `forbidden`, `unauthenticated`, `invalid`), a message, and an optional field. TanStack Query `queryFn`/`mutationFn` code keeps its current structure, and inferred result types become the DTO schemas' types.
- `/rpc/validate` is removed; nothing calls it. Form validation runs the shared input schemas on the client.
- **CSRF:**
  - The HTML shell embeds a per-session CSRF token in a `csrf-token` meta tag: an HMAC of the session token under a server secret, or a guest token bound to a signed cookie when there's no session.
  - RPC middleware rejects requests unless all of these hold: the `X-CSRF-Token` header matches; `Origin` (or `Sec-Fetch-Site`) is same-origin; the content type is JSON.
  - `buildCSRFHeaders()` keeps its name and behaviour and moves into the shared client.
  - Better Auth's endpoints rely on its own origin checks plus SameSite cookies.
  - After sign-in or sign-out the SPA reloads the token, either by reloading the shell or from a small endpoint that returns a fresh token.

### Auth UI

- New React pages for sign-in (password, plus a "send me a magic link" option), registration, forgot password, reset password, confirm email (click to confirm) and magic-link sign-in (click to sign in). They use the existing UI primitives and Lucide icons. The current sign-in and register paths (`/sign-in`, `/register`, `/reset`) and the redirect back to the original page after sign-in are kept.
- The browser uses Better Auth's client to call the auth endpoints. The `currentUser` query is still fed by `getMe` and invalidated after any auth state change.

### Background jobs

- `VerifySchoolMembership` becomes a consumer of Effect's SQL-backed persisted queue, running in the server process:
  - the queue item ID is derived from the user ID, so a user is never queued twice (replacing Oban's uniqueness);
  - up to 20 attempts;
  - retry delay of 60 seconds × 2^(attempt − 1), capped at one day;
  - a 20-second timeout per attempt.
- Its behaviour is unchanged:
  - it exits without doing anything unless the user is confirmed, has no organization, and has a pending organization;
  - it cancels with no retry when the email domain no longer matches;
  - it treats approved or verified organizations as already verified;
  - it defers by 60 seconds when the registry failed less than 60 seconds ago;
  - it records the registry result or failure on the organization, and activates the pending organization with the same guarded conditional update.
- The job is enqueued in the same database transaction that sets the user's pending organization. If the queue's SQL store can't share the caller's transaction, a small outbox row written in the transaction is moved into the queue after commit. This is checked in phase 1.
- The SchoolRegistry adapter does a WHOIS lookup over TCP (EDUCAUSE for `.edu`, JANET for `.ac.uk`) with the same domain support rules and response parsing. It's a service, so tests can substitute it.

### Email

- A Mailer service sends through the Resend HTTP API using Effect's HTTP client, with the configured sender address. Templates are TypeScript functions ported from the current senders: confirmation, password reset, magic link, classroom invite, membership approval. In development, the Mailer logs messages instead of sending them.
- Email links always use HTTPS and the configured public host.

### Configuration and observability

- All configuration goes through Effect Config, with secrets held as redacted values and everything validated at startup:
  - `DATABASE_URL`, `DATABASE_SSL`, `POOL_SIZE`;
  - the public host and `PORT`;
  - the Better Auth secret and the CSRF secret;
  - `RESEND_API_KEY`, `MAIL_FROM`, `SUPPORT_EMAIL`;
  - the optional OTLP endpoint.
  The environment example file is updated to match.
- Logs are structured JSON in production with spans around each RPC procedure and job. Exporting to OpenTelemetry is optional and off by default. Logs, spans and errors never contain tokens, full email links or credentials.

### Deployment

- A multi-stage Docker image: Bun installs dependencies and builds the web app and server; a slim Node 24 image runs them. One image has two entry points, serve and migrate.
- A new Docker Compose file defines four services:
  - `postgres:17`, with a named volume and a health check;
  - `migrate`, a one-shot run of the migrate entry point that starts after Postgres is healthy;
  - `app`, which starts after `migrate` completes successfully, listens only on the internal network, and has a health check on `/healthz`;
  - `cloudflared`, which runs the Cloudflare Tunnel from a tunnel token and forwards to the app.
  Secrets come from an env file that isn't committed.
- The Railway configuration keeps the same shape: Dockerfile build, the migrate entry point as the pre-deploy command, the serve entry point as the start command, and `/healthz` as the health check.
- Deployment docs are updated for both the Compose and Railway setups. The existing backup, restore and backup-smoke scripts work unchanged because the schema is unchanged. The release-smoke script is updated to start the Node server instead of the Elixir release.

### Delivery phases

0. **Skeleton:** workspace, config, database layer, baseline migration, `/healthz`, static files and SPA shell, CSRF, Dockerfile and Compose, and a browser bundle-size check for the shared client.
1. **Authentication and accounts:** the Better Auth migrations and backfill, the password, verification, magic link, reset and change-password flows, the auth pages, `getMe`/`updateMyProfile`/campus assignment, the verification job and the SchoolRegistry.
2. **Public reads:** categories, organizations, public petition lists, petition detail with the guest DTO.
3. **Petition writes:** petitions, signatures, comments, updates.
4. **Classrooms and memberships,** including the invite and approval emails.
5. **Moderation, support, user roles, notifications and preferences.**
6. **Cutover rehearsal:** against a restored production backup, followed by the production deploy.

## Testing Decisions

- **A good test** exercises observable behaviour through the app's public surface: an RPC call or auth request goes in; a response, saved state, sent email or queued job comes out. Tests don't import policy modules, SQL helpers or DTO mappers directly, and they don't assert on internal calls. A refactor that keeps behaviour must not break tests.
- **Seam A, the HTTP surface (main seam).** Tests build the composed server as an in-process web handler and send real HTTP requests: RPC procedures, Better Auth endpoints, the SPA shell (CSRF meta tag, the guest redirect for the petitions list) and `/healthz`. They run against a disposable Postgres prepared by the real migrations (baseline plus additions). The only replaced services are:
  - an in-memory Mailer that records messages, so tests can pull confirmation, reset, magic-link, invite and approval links out of them and follow them;
  - a scripted SchoolRegistry that returns success, not-found, unavailable, inconclusive or unsupported-domain.
  Test helpers create users at each stage (unconfirmed, confirmed, complete profile) and sign them in through the real auth endpoints, so the session cookie is used throughout.
- **Seam B, draining the job queue.** Tests can run the verification queue until it's empty, with controllable time, to check retries and backoff, deferral, cancellation when the domain no longer matches, uniqueness, and activation, without real waiting.
- **Policy matrix.** For every procedure, a table-driven test at Seam A checks the outcome (allowed, forbidden, unauthenticated, hidden/not found) for each actor type: guest, unconfirmed user, confirmed user with an incomplete profile, student on the same campus, student on another campus, classroom student member, active TA, the classroom's professor, campus admin of the same organization, campus admin of another organization, and superadmin. Expected outcomes come from the current Ash policies listed under Authorization.
- **Parity and data checks:**
  - a test that the baseline migration produces the same schema as a restored production backup, by comparing schema-only dumps;
  - a cutover rehearsal that restores a production backup into a disposable database, runs the additive migrations, and signs in through Seam A with an existing user's original password;
  - a check that concurrent signature attempts on the same petition produce exactly one signature, and that signing races correctly with closing.
- **Prior art:** the ExUnit suites are the behaviour spec and get ported scenario by scenario. They cover:
  - user accounts, profile, organization signup and organization concurrency;
  - activity privacy and the profile RPC;
  - school registry and verification job;
  - petition and petition changesets, comments, classroom memberships, moderation;
  - the security and security RPC suites;
  - the auth controller, return-to and RPC controller tests;
  - runtime config and mailer tests.
  The current `ConnCase`/`DataCase` and the registry stub are the model for Seam A's fixtures and fake services. The existing Bun petition-mutation test in the frontend stays.
- **Tooling:** `@effect/vitest` on Vitest 5 under Node. The frontend's format, lint, TypeScript and tooling checks are kept, and a replacement for the `precommit` script runs formatting, lint, typecheck, the server tests and the web build together.

## Out of Scope

- ash_admin (`/admin`), the JSON API (`/api/json` and Swagger UI), Phoenix LiveDashboard and the Swoosh mailbox preview. None are replaced.
- `/rpc/validate` and client-side field selection.
- OAuth providers, passkeys, two-factor authentication and other Better Auth plugins beyond email/password and magic link.
- Carrying existing sessions or tokens across cutover. Users sign in again once.
- Dropping legacy schema objects (`tokens`, `users.hashed_password`, `oban_jobs`, Ecto's migrations table). That's a follow-up after cutover has been stable.
- Effect HttpApi/OpenAPI, Effect Atom in place of TanStack Query, and renaming the `/ash-typescript` URL prefix.
- Multi-node deployment and clustered job processing.
- New product features or UX changes beyond moving the auth screens into React.
- The separate Rust rewrite.

## Further Notes

- Effect 4.0.0 was released on 2026-10-01; 4.0.6 is current. Most Effect examples, and much model training data, target v3. v4 renamed many APIs (service definitions, Cause, Schema changes), so work from the v4 documentation and the installed source.
- Better Auth has a documented Effect 4 integration that mounts its web handler in the Effect HTTP server. Better Auth errors and hooks run outside Effect, so its hooks call into the server's Effect runtime, and errors from that boundary are mapped explicitly.
- Elixir can't run on the development host, so there's no side-by-side comparison here. If more confidence is needed, CI (which has Elixir) could record golden RPC responses from the old app for the fixed-DTO procedures.
- Biggest risks:
  1. Authorization regressions without declarative policies, which is why the policy matrix exists.
  2. Getting the require-interaction behaviour right on the confirmation and magic-link pages.
  3. Keeping `confirmed_at` and `email_verified` in sync.
  4. Upgrades of the unstable-tagged Effect modules.
  5. The size of the Effect client in the browser bundle, measured in phase 0.

# MVP implementation contract

## Request flow

React calls the generated Ash RPC client with CSRF headers. Phoenix loads the session user into the Ash actor. Domain declarations expose resource actions. Resource policies and validations authorize and persist the change. The browser uses actor-derived capabilities for controls and refreshes queries after mutations.

## Selected structure

Keep existing Ash resources as the authorization boundary. Add shared Ash-native checks only for repeated petition eligibility. Avoid a second access service or mirrored context model. Keep existing create_signature and create_update RPC names. Dedicated close_petition and mark_petition_victory actions own lifecycle transitions. update_petition edits content without accepting status. Signature input is petitionId plus reason. Identity and verification come from the actor.

Petition privacy includes direct reads, nested and inverse User relationships, filters, sorting, and aggregate inference. Expose hasSigned and canManage for UI controls without disclosing owner or signer identity. Existing actor ownership on current master stays.

User.update_my_profile accepts firstName, lastName, graduationYear. Derive organization from the confirmed email's exact domain. No caller-supplied role, organization, email, or verification state. get_me exposes emailVerified, profileComplete, organizationId, and organization name. Profile updates are actor-scoped with identities: []. Public links remain readable. Signed-in campus browsing filters petitions by stable organizationId captured at creation. Unmatched email domains get a support path. An operator configures supported organizations.

Petition receives nullable organization_id for historical compatibility. New public petitions use the actor's campus. Classroom petitions use classroom organization where present. Historical ownerless or campus-less records are not assigned arbitrary values. Require profile/verification for new participation; never silently verify historical signatures.

Classroom membership remains pending, active, or removed. A verified actor can join by a valid unarchived code through a narrow lookup. Repeated joins return the existing membership state without creating another row. Removed membership cannot reactivate through the old code.

Moderation uses ContentReport with required petition_id and optional comment_id. A comment report derives its petition from the visible comment. States are open, resolved, dismissed. Reporters see their own submissions. Superadmins and same-campus admins resolve reports. Hidden petition/comment state is separate from open/closed/victory lifecycle and ordinary queries exclude hidden content. Hiding petition blocks its child content and interactions.

SupportRequest has kind support or account_deletion and state open or resolved. Authenticated users submit requests. Operators review them. No automatic destructive account deletion. The UI explains review and offers the persisted request flow without promising a response time.

Production mail uses installed Swoosh Resend with Req. Runtime requires real credentials and sender/support addresses. Local and test adapters remain. No live deployment or provider delivery claim without evidence.

## Contracts and ownership

- Security worker owns Petition, Signature, Comment, Update and focused tests. It implements update, close, mark_victory, has_signed, can_manage, organization_id and hidden_at where needed. It sends Post RPC declarations to the parent.
- Accounts worker owns User, Organization, profile page, auth context and focused tests. It closes inverse anonymous ownership leaks and implements update_my_profile. It sends Accounts RPC declarations and route/nav changes to parent.
- Classroom worker owns Classroom, ClassroomMembership and focused tests. Email senders belong to operations.
- Creator worker owns petition management UI, detail/create/browse/dashboard changes and browser mutation contract updates.
- Moderation worker owns ContentReport, SupportRequest, moderation/report/support/privacy/rules UI and focused tests. Parent integrates required changes into secured petition/comment policies.
- Operations worker owns mailers, config, health controller, release/deploy scripts, CI, deployment documentation, and mail tests.
- Parent owns domain declaration integration, router/app navigation composition, generated RPC, migration generation, final verification and PR evidence. Workers have separate worktrees and unique test databases.

## Selection and tradeoffs

Candidate A is the proposed base. Its existing-resource design avoids duplicating Ash's filter authorization in a pure access context. Candidate B contributes a petition-scoped report with an optional comment and persisted support/deletion requests. Reject B's dropping signature columns and deleting ownerless rows. Existing data stays intact and sensitive fields become private. Reject automatic campus backfills that could assign ambiguous organizations.

The capability fields support UI decisions. Mutations always authorize again. Public signature counts must stay accurate after identity protection. Tests include forged IDs, unconfirmed users, private classrooms, anonymous inverse reads, disabled comments, closed/expired petitions, removal, duplicate signing and joining, and cross-campus admin limits.

## Verification

Each workstream captures a regression before fixing it and runs focused checks afterward. Integration runs precommit, TypeScript, asset build, and a real browser scenario with synthetic accounts. Browser acceptance covers registration/confirmation/profile, create/sign/edit/update/close, join, report, moderation and support. Desktop/mobile screenshots accompany the PR. Deployment credentials, live mail delivery, production backup destination and operator policy approval remain explicit external gates.

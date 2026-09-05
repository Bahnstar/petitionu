# Architecture judgment

| Axis | Candidate A | Candidate B |
| --- | --- | --- |
| Authorization completeness | **A**. Covers direct, nested, inverse, filter, aggregate, actor-spoofing, classroom, moderation, and transaction races. | **B-**. One custom adapter must support create checks, filters, nested loads, and actor-aware calculations. That is unproven Ash complexity and a bypass-read risk. |
| Maintainable Ash contracts | **A**. Existing resources remain the boundary. Named lifecycle actions and at most one shared visibility check fit current code. | **B-**. Its context types duplicate shapes Ash already carries. MVP implementation would first have to prove the adapter. |
| Inverse privacy | **A**. Explicitly covers `User.petitions`, aggregates, nested loads, filtering, sorting, and anonymous-author attacks. | **B**. Safe presentation fields are good, but the plan is less explicit about inverse reads through User and aggregate behavior. |
| Campus enrollment | **A-**. Exact normalized domains and captured petition campus are sound. Allowing `organizationId` in input should be removed when a unique email-domain match exists. | **A-**. Deriving campus server-side is safer. Automatic backfill still needs an audited preview and exception list. |
| Deployability | **A-**. Provider and external delivery/backup gates are honest, but artifacts are less concrete. | **A**. Adds health, release migration, Docker, CI, and runtime mail requirements. |
| Real verification | **A**. Includes actor-aware RPC, concurrency, upgrades, browser persistence, and mailbox confirmation. | **A-**. Excellent Playwright journey, but it underweights migration inventories and concurrency. |

## Recommendation

Use **Candidate A as the base**. It matches the Ash-centered architecture and covers more authorization surfaces with less machinery. Start with adversarial RPC tests. Permit one `PetitionVisibility` filter check only after duplication appears. Do not begin with a generic context framework.

Graft these parts from Candidate B:

- Use one petition-scoped `ModerationReport` with required `petition_id` and optional `comment_id`. Derive the petition from the comment action so mismatched targets are impossible.
- Persist `AccountRequest` with `:support | :account_deletion` and an operator resolution state. Keep deletion manual until retention rules exist.
- Add the concrete health, release migration, Docker, CI, E2E mailbox, and screenshot plan.
- Derive organization from confirmed email server-side. Do not accept arbitrary `organizationId` from profile input.

Reject Candidate B's unsafe migration instructions. Never delete ownerless petitions as “fixtures,” assign them to guessed users, silently infer historical authors, automatically attach confirmed users to campuses without a reviewed mapping, or drop signature audit columns before retention requirements and production data are inventoried. Keep nullable historical ownership and private legacy signature fields until an operator-approved migration proves every row's treatment. Add new constraints only after a dry-run report is clean.

## Implementation decision

The deployment implementation uses an OTP release archive built on the production host's operating system and architecture. CI produces the Linux archive. This replaces the proposed Docker artifact and avoids introducing an unverified container image. The migration, runtime configuration, health, backup, and browser checks remain part of the accepted plan. See [deployment instructions](../deployment.md).

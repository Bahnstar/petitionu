# Web app tests

The suites run under `bun test` and are part of `bun run check` (and so `bun run precommit`).

- `petition-mutations.test.mjs` (`bun run test:petitions`): petition writes through a real
  QueryClient against a fake `POST /rpc` that answers in Effect's JSON form. Covers CSRF
  headers, server and transport failures, related cache refreshes and owner form timing.
- `petition-comments.test.tsx` (`bun run test:comments`): the petition page's conversation in
  happy-dom with a stubbed `fetch`: threads, the notice for a removed parent, the inline reply
  form, who is offered Reply, an open form's text moving to the notice when its comment leaves
  the page, and a stale tab's writes ending with the sign-in message with their text intact.
- `auth-pages.test.tsx` (`bun run test:auth`): the auth pages in happy-dom with a stubbed
  `fetch`. Confirmation and magic-link pages show the link's address first, make switching
  accounts a deliberate choice, and like the reset page use their token only after the click.
- `profile-password.test.tsx` (`bun run test:profile`): the profile page's password card in
  happy-dom with a stubbed `fetch`: the change form's own checks, Better Auth's wrong-password
  error, the CSRF reload after a change, and the reset link offered to accounts without one.
- `petition-owner-controls.test.tsx` (`bun run test:owner-controls`): what the owner's edit form
  sends in happy-dom: an unedited deadline stays out of the edit, even with seconds in it or when
  the petition's deadline changes under the open form.
- `ui-wording.test.tsx` (`bun run test:wording`): singular counts, and the petition card's
  status wording, with a victory never also reading as closed.
- `page-errors.test.tsx` (`bun run test:pages`): pages in happy-dom with a stubbed `fetch`, under
  the app's retry rule: failed queries aren't repeated once the server has answered, and each
  form shows every error against its field, a malformed `classroomId` shows the not-found view,
  a failed sign-out says so and stays on the page, sign-out doesn't wait for refetches, an auth
  change clears the previous user's cached data, sign-out clears petition drafts, a CSRF
  reload that fails twice after an auth action loads the page in full, never from startup, and a
  tab whose session changed elsewhere recovers without resending anything, signing anyone out over
  a real outage, or losing what was typed.
- `classroom-controls.test.tsx` (`bun run test:classroom`): the classroom page in happy-dom with
  a stubbed `fetch`: member controls follow the server's eligibility fields, never the roster
  (a TA's controls show without their own row, and a roster row saying "TA" grants nothing), an
  archived classroom offers Decline but not Approve, archiving refreshes the roster, and a TA
  leaves through Leave classroom rather than Remove on their own row.
- `bundle-size.test.mjs` (`bun run test:bundle-size`): the bundle-size budget script against
  temporary builds.

Server behaviour (procedures, policies, auth flows) is tested in `apps/server/test` against a
real Postgres; see the repository `AGENTS.md`.

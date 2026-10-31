# Web app tests

The suites run under `bun test` and are part of `bun run check` (and so `bun run precommit`).

- `petition-mutations.test.mjs` (`bun run test:petitions`): petition writes through a real
  QueryClient against a fake `POST /rpc` that answers in Effect's JSON form. Covers CSRF
  headers, server and transport failures, related cache refreshes and owner form timing.
- `auth-pages.test.tsx` (`bun run test:auth`): the auth pages in happy-dom with a stubbed
  `fetch`. Confirmation, magic-link and reset links use their token only after the button is
  clicked.
- `profile-password.test.tsx` (`bun run test:profile`): the profile page's password card in
  happy-dom with a stubbed `fetch`: the change form's own checks, Better Auth's wrong-password
  error, the CSRF reload after a change, and the reset link offered to accounts without one.
- `ui-wording.test.tsx` (`bun run test:wording`): singular counts, and the petition card's
  status wording, with a victory never also reading as closed.
- `page-errors.test.tsx` (`bun run test:pages`): pages in happy-dom with a stubbed `fetch`, under
  the app's retry rule: failed queries aren't repeated once the server has answered, and each
  form shows every error against its field, a malformed `classroomId` shows the not-found view,
  and a failed sign-out says so and stays on the page.
- `bundle-size.test.mjs` (`bun run test:bundle-size`): the bundle-size budget script against
  temporary builds.

Server behaviour (procedures, policies, auth flows) is tested in `apps/server/test` against a
real Postgres; see the repository `AGENTS.md`.

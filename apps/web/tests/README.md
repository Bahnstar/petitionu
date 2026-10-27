# Web app tests

Both suites run under `bun test` and are part of `bun run check` (and so `bun run precommit`).

- `petition-mutations.test.mjs` (`bun run test:petitions`): petition writes through a real
  QueryClient against a fake `POST /rpc` that answers in Effect's JSON form. Covers CSRF
  headers, server and transport failures, related cache refreshes and owner form timing.
- `auth-pages.test.tsx` (`bun run test:auth`): the auth pages in happy-dom with a stubbed
  `fetch`. Confirmation, magic-link and reset links use their token only after the button is
  clicked.

Server behaviour (procedures, policies, auth flows) is tested in `apps/server/test` against a
real Postgres; see the repository `AGENTS.md`.

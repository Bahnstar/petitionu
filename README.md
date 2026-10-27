# PetitionU

PetitionU gives students a place to propose changes at their school, gather signatures, and organize support with classmates.

The application includes petition browsing and creation, signatures, comments, petition updates, a personal dashboard, classrooms with membership and classroom-specific petitions, content reports and support requests. Accounts support password and magic-link sign-in.

## Stack

- **Server:** [Effect 4](https://effect.website) on Node 24+, PostgreSQL 16+, Better Auth for authentication.
- **API:** Effect RPC over `POST /rpc`, with the procedures, schemas and errors shared between server and browser in `packages/domain`.
- **Web app:** React, TypeScript, React Router and TanStack Query, built with Vite.
- **UI:** Tailwind CSS, shared Radix-based components, and Lucide icons.

The server serves the built web app, the RPC API, Better Auth under `/api/auth` and `/healthz`. The React app lives under `/ash-typescript`; visiting `/` redirects there.

Bun is the package manager and script runner; the server itself runs on Node.

## Local setup

See [GETTING_STARTED.md](GETTING_STARTED.md) for a step-by-step setup. In short:

```sh
bun install
bun run test-db          # optional: the Postgres container the server tests use
DATABASE_URL=... bun run migrate
DATABASE_URL=... bun run seed
DATABASE_URL=... BETTER_AUTH_SECRET=... CSRF_SECRET=... PUBLIC_HOST=localhost:5173 bun run dev
```

`bun run seed` creates a campus with a student, a classmate, a professor and a campus admin (all with the password `petitionu-dev-password`), plus petitions, a classroom, content reports and a support request. It refuses to run when `NODE_ENV=production` and does nothing if the seed accounts already exist.

## Development workflow

Run focused tests for the behaviour you changed, then the full check:

```sh
cd apps/server && npx vitest run test/petitions.test.ts
bun run precommit
```

`bun run precommit` applies formatting, then runs format checks, lint, typecheck and tests across the workspace (`bun run check`), then builds the web app and server (`bun run build`). The server tests need Docker: they start a dedicated Postgres container (`petitionu-effect-pg` on port 55432) unless `TEST_DATABASE_URL` points at another server.

See [AGENTS.md](AGENTS.md) for repository conventions, [frontend tooling](docs/frontend-tooling.md) for the web lint policy and [deployment](docs/deployment.md) for production.

## Codebase map

| Path | Contents |
| --- | --- |
| `packages/domain/src/` | RPC groups per area, DTO schemas, errors, the browser RPC client |
| `apps/server/src/` | Effect server: one module per area, its policy module, auth, mailer, jobs |
| `apps/server/src/migrations/` | Database migrations (baseline plus additions) |
| `apps/server/test/` | Server tests at the HTTP seam, including the policy matrix |
| `apps/web/js/pages/` | React pages |
| `apps/web/js/features/` | Petition, classroom, dashboard, moderation and profile components |
| `apps/web/components/ui/` | Shared UI primitives |
| `apps/web/css/` | Tailwind entry point and application styles |
| `apps/web/tests/` | Web app tests |
| `scripts/` | Backup, restore, release-smoke and cutover rehearsal scripts |
| `docs/` | Deployment, moderation, school registry and the backend rewrite spec |

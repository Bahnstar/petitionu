# Getting started

This sets up PetitionU for local development: a Postgres database, the Effect server with live reload, and the Vite dev server for the web app.

## Prerequisites

- [Bun](https://bun.sh) 1.4 or later (package manager and script runner).
- Node.js 24 or later (the server runs on Node and loads TypeScript directly).
- Docker, for Postgres and for the server tests.

## 1. Install dependencies

```sh
bun install
```

## 2. Start Postgres

Any PostgreSQL 16+ server works. With Docker:

```sh
docker run -d --name petitionu-dev-pg -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:5432:5432 postgres:17
docker exec petitionu-dev-pg createdb -U postgres petitionu_dev
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/petitionu_dev
```

The server tests don't use this database. `bun run test-db` starts their own container (`petitionu-effect-pg` on port 55432), and Vitest starts it automatically.

## 3. Migrate and seed

```sh
bun run migrate
bun run seed
```

`bun run seed` creates these accounts, all with the password `petitionu-dev-password`:

| Email | Role |
| --- | --- |
| `student@example.edu` | Student |
| `classmate@example.edu` | Student |
| `professor@example.edu` | Professor (teaches the seeded classroom) |
| `admin@example.edu` | Campus admin |

It also adds petitions, signatures, comments, a classroom, content reports and a support request. It refuses to run when `NODE_ENV=production` and does nothing if the accounts already exist.

## 4. Run the app

```sh
export BETTER_AUTH_SECRET=$(openssl rand -base64 48)
export CSRF_SECRET=$(openssl rand -base64 48)
export PUBLIC_HOST=localhost:5173
bun run dev
```

This starts the server on port 4100 (`NODE_ENV=development`, restarted on change) and Vite on [localhost:5173](http://localhost:5173), which proxies `/rpc`, `/api/auth` and `/healthz` to the server. Open the app on port 5173. Set `PORT` to move the server, and `PETITIONU_SERVER_URL` so Vite follows it.

In development without `RESEND_API_KEY`, emails are written to the server log instead of being sent. Email links start with `https://PUBLIC_HOST`; open the same path on `http://localhost:5173` to follow one.

| Route | Purpose |
| --- | --- |
| `/ash-typescript` | Application home |
| `/ash-typescript/petitions` | Browse petitions |
| `/ash-typescript/dashboard` | Personal dashboard |
| `/ash-typescript/classrooms` | Classrooms |
| `/sign-in`, `/register`, `/reset` | Auth pages |
| `/healthz` | Health check |

To try the production build locally, run `bun run build`, then `node apps/server/dist/serve.js` with the same variables and `NODE_ENV=development`; it serves `apps/web/dist` itself.

## 5. Check your changes

```sh
bun run precommit
```

This formats the workspace, then runs lint, typecheck and all tests, then builds. See [AGENTS.md](AGENTS.md) for conventions and [docs/deployment.md](docs/deployment.md) for production.

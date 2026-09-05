# PetitionU

PetitionU gives students a place to propose changes at their school, gather signatures, and organize support with classmates.

The application includes petition browsing and creation, signatures, comments, petition updates, a personal dashboard, and classrooms with membership and classroom-specific petitions. Accounts support password and magic-link sign-in.

## Stack

- **Backend:** Elixir, Phoenix, Ash Framework, and PostgreSQL.
- **Frontend:** React, TypeScript, React Router, and TanStack Query.
- **UI:** Tailwind CSS, shared Radix-based components, and Lucide icons.
- **Authentication and APIs:** AshAuthentication, generated AshTypescript RPC clients, and an Ash JSON API.

Phoenix serves the application and bundles its assets with esbuild and Tailwind. The React application lives under `/ash-typescript`; visiting `/` redirects there.

## Local setup

### Prerequisites

- Elixir and a compatible Erlang/OTP installation. The project declares Elixir `~> 1.15` in `mix.exs`; it does not pin an exact toolchain.
- PostgreSQL running locally, with permission to create databases and install the `citext` extension.
- Bun for installing JavaScript dependencies using `assets/bun.lock`.
- Node.js for the TypeScript CLI and browser test scripts.

The default database connection is:

| Setting | Development | Tests |
| --- | --- | --- |
| Host | `localhost` | `localhost` |
| Username | `postgres` | `postgres` |
| Password | `postgres` | `postgres` |
| Database | `petitionu_dev` | `petitionu_test` |

Update [config/dev.exs](config/dev.exs) and [config/test.exs](config/test.exs) if your local PostgreSQL credentials differ. Local database settings come from these files; `DATABASE_URL` is used by the production configuration.

### Install and start

From the repository root:

```sh
# Install frontend dependencies before Mix builds the assets.
cd assets
bun install --frozen-lockfile
cd ..

# Install Elixir dependencies, set up the database, build assets, and seed data.
mix setup

# Start the development server.
mix phx.server
```

Open [localhost:4000](http://localhost:4000). For an interactive Elixir shell alongside the server, use `iex -S mix phx.server`. To choose another port, use `PORT=4001 mix phx.server`.

The development server watches and rebuilds JavaScript and CSS. There is no separate frontend development server to start.

### Try the application

`mix setup` runs [priv/repo/seeds.exs](priv/repo/seeds.exs), which adds a sample university, users, categories, petitions, signatures, comments, and classrooms. The seed script uses randomized data in places, so sample results can vary.

Register at `/register`, then open `/dev/mailbox` to find the confirmation email. Development emails stay in the local Swoosh mailbox; no external email service is needed.

| Local route | Purpose |
| --- | --- |
| `/ash-typescript` | Application home |
| `/ash-typescript/petitions` | Browse petitions |
| `/ash-typescript/create` | Create a petition |
| `/ash-typescript/dashboard` | Personal dashboard |
| `/ash-typescript/classrooms` | Classrooms |
| `/sign-in` | Sign in |
| `/dev/mailbox` | Preview development emails |
| `/dev/dashboard` | Phoenix LiveDashboard |
| `/admin` | Ash admin interface |
| `/api/json/swaggerui` | JSON API documentation |

The mailbox, LiveDashboard, and admin routes are enabled in development.

## Development workflow

Run a focused test for the behavior you changed, then the repository checks:

```sh
mix test test/petitionu_web/controllers/ash_typescript_rpc_controller_test.exs
mix precommit
```

`mix precommit` compiles with warnings treated as errors, removes unused dependency locks, formats Elixir code, and runs the backend test suite. Tests require PostgreSQL; the `mix test` alias sets up the test database first.

For frontend changes, also run:

```sh
cd assets
./node_modules/.bin/tsc --noEmit
cd ..
mix assets.build
```

`mix precommit` does not type-check TypeScript or build frontend assets. Browser navigation checks are documented in [assets/tests/README.md](assets/tests/README.md).

### Changing resources and RPC contracts

Business rules, actions, and policies live in Ash resources. RPC declarations live in the `Petitionu.Accounts` and `Petitionu.Post` domains.

- After changing the RPC contract, run `mix ash_typescript.codegen`. Do not edit the generated `assets/js/ash_rpc.ts` directly.
- For resource changes that need database migrations, run `mix ash.codegen describe_your_change`, review the generated migrations, then run `mix ash.migrate`.
- Preserve `buildCSRFHeaders()` on browser RPC calls.

Read `mix help <task>` before using a Mix task. See [AGENTS.md](AGENTS.md) for repository conventions and pointers to the relevant package usage rules.

## Codebase map

| Path | Contents |
| --- | --- |
| `lib/petitionu/accounts/` | Users, organizations, authentication tokens, preferences, and notifications |
| `lib/petitionu/post/` | Petitions, signatures, comments, updates, categories, classrooms, and memberships |
| `lib/petitionu_web/` | Phoenix routes, controllers, authentication views, and layouts |
| `assets/js/pages/` | React pages |
| `assets/js/features/` | Petition, classroom, and dashboard components |
| `assets/components/ui/` | Shared UI primitives |
| `assets/css/` | Tailwind entry point and application styles |
| `config/` | Development, test, and production configuration |
| `priv/repo/` | Database migrations and seed data |
| `test/` | Backend tests |
| `assets/tests/` | Browser regression scripts |

## Production configuration

[config/runtime.exs](config/runtime.exs) requires `DATABASE_URL`, `SECRET_KEY_BASE`, and `TOKEN_SIGNING_SECRET` in production. Set `PHX_HOST` to the public hostname; `PORT` defaults to `4000`. Set `PHX_SERVER=true` when starting a release to enable the HTTP server.

The mailer currently defaults to Swoosh's local adapter. Configure a delivery adapter for production authentication emails. Asset deployment is defined by the `assets.deploy` alias in [mix.exs](mix.exs).

# Petitionu - Getting Started Guide

Petitionu is a React and Phoenix application built with the Ash framework for creating and managing petitions. This guide will help you get up and running quickly.

## Prerequisites

- Elixir 1.16+
- PostgreSQL
- Node.js

## Quick Start

### 0. Set up PostgreSQL with Docker

Start PostgreSQL using Docker:

```bash
docker run --name petitionu-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -p 5432:5432 -d postgres
```

This will:
- Start a PostgreSQL 15 container named `petitionu-postgres`
- Set username/password to `postgres/postgres` (matching config)
- Expose port 5432 for local connections

### 1. Install Dependencies

```bash
cd assets && bun install   # installs the React SPA's npm packages
cd ..
mix setup
```

This command will:
- Install Elixir dependencies
- Set up Ash resources
- Install and build frontend assets
- Run database seeds

### 2. Start the Database

Ensure PostgreSQL is running and create the database:

```bash
mix ecto.create
mix ecto.migrate
```

*Optional*: Seed the database with sample data:

```bash
mix run priv/repo/seeds.exs
```

### 3. Start the Phoenix Server

```bash
mix phx.server
```

Visit [`localhost:4000`](http://localhost:4000) in your browser.

## Project Structure

### Core Components

- **`assets/`** - Frontend assets (JS, CSS, images)
  - Includes React SPA
- **`lib/petitionu/`** - Ash resources and business logic
  - `accounts/` - User authentication and management
  - `post/` - Petition posts and content
- **`lib/petitionu_web/`** - Phoenix web layer
  - `controllers/` - HTTP controllers
  - `live/` - LiveView components
  - `components/` - Reusable UI components

### Key Technologies

- **Ash Framework** - Declarative domain modeling
- **Ash TypeScript** - TypeScript support for Ash resources
- **Phoenix LiveView** - Real-time web UI
- **Ash Authentication** - User auth with multiple strategies
- **Ash JSON:API** - REST API endpoints
- **Tailwind CSS** - Styling framework

## Frontend Development

The app includes TypeScript support via `ash_typescript`. Client code is in `assets/js/`.

**Main Libraries**:
- React
- React Router
- Tanstack Query
- Tailwind v4


## Authentication

The app includes comprehensive authentication with Ash Authentication:

### UI Endpoints (LiveView pages):
- **Sign in**: `/sign-in`
- **Registration**: `/register`
- **Sign out**: `/sign-out`
- **Password reset**: `/reset`

### Token-based Endpoints (from emails):
- **Email confirmation**: `/confirm_new_user/:token` (GET)
- **Password reset with token**: `/password-reset/:token` (GET)
- **Magic link sign in**: `/magic_link/:token` (GET)

### API Endpoints (internal/auth framework):
- **Magic link request**: `/auth/user/magic_link/request` (POST)
- **Password reset request**: `/auth/user/password/reset_request` (POST)

## Admin Interface

Development admin dashboard available at:
- **Admin UI**: `/admin` (Ash Admin)
- **Live Dashboard**: `/dev/dashboard` (Phoenix LiveDashboard)
- **Mailbox Preview**: `/dev/mailbox` (Swoosh)

## API Endpoints

- **TypeScript RPC**: `/rpc/run`, `/rpc/validate`
- **JSON:API**: `/api/json/*`
- **OpenAPI/Swagger**: `/api/json/open_api`

## Ash Resources

The application uses Ash for domain modeling. Key resources include:

- **User** - Authentication and user management
- **Post** - Petition content
- **Comment** - Discussion on petitions
- **Signature** - Petition signatures

## Ash Admin

Access the admin interface at `/admin` to:
- View and manage resources
- Inspect data relationships
- Test actions and queries


## Database Configuration

Edit `config/dev.exs` to adjust database settings:

```elixir
config :petitionu, Petitionu.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "petitionu_dev"
```

## Documentation

- **Phoenix**: https://hexdocs.pm/phoenix
- **Ash Framework**: https://hexdocs.pm/ash
- **Ash TypeScript**: https://hexdocs.pm/ash_typescript
- **Ash Authentication**: https://hexdocs.pm/ash_authentication
- **Project Usage Rules**: See `AGENTS.md` for detailed coding guidelines

## Support

- **Phoenix Forum**: https://elixirforum.com/c/phoenix-forum
- **Ash Documentation**: https://hexdocs.pm/ash
- **Issues**: Check project repository for issue tracking
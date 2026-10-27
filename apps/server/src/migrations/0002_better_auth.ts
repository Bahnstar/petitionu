import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Tables and columns Better Auth needs, added next to the existing schema. `confirmed_at`
 * stays the domain's source of truth; `email_verified` mirrors it for Better Auth.
 */
const statements = [
  `ALTER TABLE public.users
    ADD COLUMN email_verified boolean DEFAULT false NOT NULL,
    ADD COLUMN name text DEFAULT ''::text NOT NULL,
    ADD COLUMN image text`,
  `UPDATE public.users SET email_verified = confirmed_at IS NOT NULL`,
  `CREATE TABLE public.account (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL PRIMARY KEY,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX account_user_id_index ON public.account USING btree (user_id)`,
  `CREATE UNIQUE INDEX account_provider_account_index ON public.account USING btree (provider_id, account_id)`,
  `CREATE TABLE public.session (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL PRIMARY KEY,
    token text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX session_user_id_index ON public.session USING btree (user_id)`,
  `CREATE TABLE public.verification (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX verification_identifier_index ON public.verification USING btree (identifier)`,
  `CREATE TABLE public.rate_limit (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL PRIMARY KEY,
    key text NOT NULL UNIQUE,
    count integer NOT NULL,
    last_request bigint NOT NULL
  )`,
  // Existing users keep their password: Better Auth reads it from a credential account.
  `INSERT INTO public.account (account_id, provider_id, user_id, password)
    SELECT id::text, 'credential', id, hashed_password FROM public.users
    WHERE hashed_password IS NOT NULL`,
]

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const statement of statements) {
    yield* sql.unsafe(statement).withoutTransform
  }
})

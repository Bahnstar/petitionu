import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** The last migration Ecto ran. Its presence means the database already has this schema. */
const latestEctoVersion = "20260908050000"

/** Every row of Ecto's `schema_migrations`, recorded so the frozen table stays truthful. */
const ectoVersions = [
  "20251113155829",
  "20251113155830",
  "20251114003155",
  "20251116075421",
  "20251118034557",
  "20251118214827",
  "20251118221734",
  "20251119040214",
  "20251119050111",
  "20251122053504",
  "20251218052901",
  "20260823171528",
  "20260905214706",
  "20260905220054",
  "20260908041404",
  "20260908044155",
  "20260908050000",
]

/**
 * The schema as the Ecto migrations left it, statement by statement, taken from
 * `pg_dump --schema-only` (comments and session settings removed). Keep it byte for byte:
 * the baseline test compares a dump of the result with `test/fixtures/schema.sql`.
 */
const schema = [
  `CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public`,
  `COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings'`,
  `CREATE TYPE public.oban_job_state AS ENUM (
    'available',
    'suspended',
    'scheduled',
    'executing',
    'retryable',
    'completed',
    'discarded',
    'cancelled'
)`,
  `CREATE FUNCTION public.ash_elixir_and("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS NOT NULL THEN $2
    ELSE $1
  END $_$`,
  `CREATE FUNCTION public.ash_elixir_and("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS TRUE THEN $2
    ELSE $1
  END $_$`,
  `CREATE FUNCTION public.ash_elixir_or("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE($1, $2) $_$`,
  `CREATE FUNCTION public.ash_elixir_or("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE(NULLIF($1, FALSE), $2) $_$`,
  `CREATE FUNCTION public.ash_raise_error(json_data jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$`,
  `CREATE FUNCTION public.ash_raise_error(json_data jsonb, type_signal anycompatible) RETURNS anycompatible
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$`,
  `CREATE FUNCTION public.ash_required(value anycompatible, payload jsonb) RETURNS anycompatible
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF value IS NULL THEN
    RETURN ash_raise_error(payload, value);
  END IF;

  RETURN value;
END;
$$`,
  `CREATE FUNCTION public.ash_trim_whitespace(arr text[]) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
    start_index INT = 1;
    end_index INT = array_length(arr, 1);
BEGIN
    WHILE start_index <= end_index AND arr[start_index] = '' LOOP
        start_index := start_index + 1;
    END LOOP;

    WHILE end_index >= start_index AND arr[end_index] = '' LOOP
        end_index := end_index - 1;
    END LOOP;

    IF start_index > end_index THEN
        RETURN ARRAY[]::text[];
    ELSE
        RETURN arr[start_index : end_index];
    END IF;
END; $$`,
  `CREATE FUNCTION public.timestamp_from_uuid_v7(_uuid uuid) RETURNS timestamp without time zone
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT to_timestamp(('x0000' || substr(_uuid::TEXT, 1, 8) || substr(_uuid::TEXT, 10, 4))::BIT(64)::BIGINT::NUMERIC / 1000);
$$`,
  `CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  timestamp    TIMESTAMPTZ;
  microseconds INT;
BEGIN
  timestamp    = clock_timestamp();
  microseconds = (cast(extract(microseconds FROM timestamp)::INT - (floor(extract(milliseconds FROM timestamp))::INT * 1000) AS DOUBLE PRECISION) * 4.096)::INT;

  RETURN encode(
    set_byte(
      set_byte(
        overlay(uuid_send(gen_random_uuid()) placing substring(int8send(floor(extract(epoch FROM timestamp) * 1000)::BIGINT) FROM 3) FROM 1 FOR 6
      ),
      6, (b'0111' || (microseconds >> 8)::bit(4))::bit(8)::int
    ),
    7, microseconds::bit(8)::int
  ),
  'hex')::UUID;
END
$$`,
  `CREATE TABLE public.category (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text,
    description text,
    color text DEFAULT '#00683d'::text,
    organization_id uuid,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
)`,
  `CREATE TABLE public.classroom_memberships (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    role text DEFAULT 'student'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    joined_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    classroom_id uuid NOT NULL,
    user_id uuid NOT NULL,
    invited_by_id uuid
)`,
  `CREATE TABLE public.classrooms (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    description text,
    join_code uuid NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    allow_student_petitions boolean DEFAULT true NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    professor_id uuid NOT NULL,
    organization_id uuid
)`,
  `CREATE TABLE public.comment (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    text text,
    sentiment text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid,
    petition_id uuid,
    parent_comment_id uuid,
    hidden_at timestamp without time zone
)`,
  `CREATE TABLE public.content_reports (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    target_title text NOT NULL,
    target_text text NOT NULL,
    reason text NOT NULL,
    details text,
    state text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    petition_id uuid NOT NULL,
    comment_id uuid,
    organization_id uuid,
    reporter_id uuid NOT NULL,
    resolver_id uuid
)`,
  `CREATE TABLE public.notification (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    reference_id text,
    title text NOT NULL,
    body text,
    status text NOT NULL,
    user_id uuid,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
)`,
  `CREATE TABLE public.oban_jobs (
    id bigint NOT NULL,
    state public.oban_job_state DEFAULT 'available'::public.oban_job_state NOT NULL,
    queue text DEFAULT 'default'::text NOT NULL,
    worker text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    errors jsonb[] DEFAULT ARRAY[]::jsonb[] NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 20 NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
    scheduled_at timestamp without time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
    attempted_at timestamp without time zone,
    completed_at timestamp without time zone,
    attempted_by text[],
    discarded_at timestamp without time zone,
    priority integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    meta jsonb DEFAULT '{}'::jsonb,
    cancelled_at timestamp without time zone,
    CONSTRAINT attempt_range CHECK (((attempt >= 0) AND (attempt <= max_attempts))),
    CONSTRAINT positive_max_attempts CHECK ((max_attempts > 0)),
    CONSTRAINT queue_length CHECK (((char_length(queue) > 0) AND (char_length(queue) < 128))),
    CONSTRAINT worker_length CHECK (((char_length(worker) > 0) AND (char_length(worker) < 128)))
)`,
  `COMMENT ON TABLE public.oban_jobs IS '14'`,
  `CREATE SEQUENCE public.oban_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`,
  `ALTER SEQUENCE public.oban_jobs_id_seq OWNED BY public.oban_jobs.id`,
  `CREATE UNLOGGED TABLE public.oban_peers (
    name text NOT NULL,
    node text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL
)`,
  `CREATE TABLE public.organization (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text,
    description text,
    domain public.citext,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    logo_url text,
    allow_public_signatures boolean DEFAULT false,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    registry_name text,
    registry_source text,
    registry_checked_at timestamp without time zone,
    registry_error text
)`,
  `CREATE TABLE public.petition (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    title text,
    description text,
    status text DEFAULT 'open'::text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid,
    goal bigint DEFAULT 1000,
    allow_comments boolean DEFAULT true,
    is_anonymous boolean DEFAULT false,
    category_id uuid,
    deadline timestamp(0) without time zone,
    classroom_id uuid,
    hidden_at timestamp without time zone,
    organization_id uuid
)`,
  `CREATE TABLE public.preference (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text,
    value text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid
)`,
  `CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
)`,
  `CREATE TABLE public.signature (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    reason text,
    ip_address text,
    user_agent text,
    is_verified boolean DEFAULT false,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    petition_id uuid NOT NULL,
    user_id uuid NOT NULL
)`,
  `CREATE TABLE public.support_requests (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    requester_email public.citext NOT NULL,
    kind text NOT NULL,
    message text NOT NULL,
    state text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    resolver_id uuid
)`,
  `CREATE TABLE public.tokens (
    jti text NOT NULL,
    subject text NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    purpose text NOT NULL,
    extra_data jsonb,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
)`,
  `CREATE TABLE public.update (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    petition_id uuid
)`,
  `CREATE TABLE public.user_petitions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    petition_id uuid NOT NULL,
    relationship text DEFAULT 'signee'::text NOT NULL,
    bookmarked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
)`,
  `CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    hashed_password text,
    confirmed_at timestamp without time zone,
    first_name text,
    last_name text,
    organization_id uuid,
    student_id text,
    graduation_year bigint,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    role text DEFAULT 'student'::text NOT NULL,
    pending_organization_id uuid
)`,
  `ALTER TABLE ONLY public.oban_jobs ALTER COLUMN id SET DEFAULT nextval('public.oban_jobs_id_seq'::regclass)`,
  `ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id)`,
  `ALTER TABLE public.oban_jobs
    ADD CONSTRAINT non_negative_priority CHECK ((priority >= 0)) NOT VALID`,
  `ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.oban_jobs
    ADD CONSTRAINT oban_jobs_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.oban_peers
    ADD CONSTRAINT oban_peers_pkey PRIMARY KEY (name)`,
  `ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.preference
    ADD CONSTRAINT preference_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version)`,
  `ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (jti)`,
  `ALTER TABLE ONLY public.update
    ADD CONSTRAINT update_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_pkey PRIMARY KEY (id)`,
  `ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id)`,
  `CREATE UNIQUE INDEX classroom_memberships_unique_membership_index ON public.classroom_memberships USING btree (classroom_id, user_id)`,
  `CREATE UNIQUE INDEX classrooms_unique_join_code_index ON public.classrooms USING btree (join_code)`,
  `CREATE INDEX oban_jobs_args_index ON public.oban_jobs USING gin (args)`,
  `CREATE INDEX oban_jobs_meta_index ON public.oban_jobs USING gin (meta)`,
  `CREATE INDEX oban_jobs_state_cancelled_at_index ON public.oban_jobs USING btree (state, cancelled_at)`,
  `CREATE INDEX oban_jobs_state_discarded_at_index ON public.oban_jobs USING btree (state, discarded_at)`,
  `CREATE INDEX oban_jobs_state_queue_priority_scheduled_at_id_index ON public.oban_jobs USING btree (state, queue, priority, scheduled_at, id)`,
  `CREATE UNIQUE INDEX organization_unique_domain_index ON public.organization USING btree (domain)`,
  `CREATE UNIQUE INDEX signature_unique_signature_index ON public.signature USING btree (petition_id, user_id)`,
  `CREATE UNIQUE INDEX users_unique_email_index ON public.users USING btree (email)`,
  `ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id)`,
  `ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON DELETE SET NULL`,
  `ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE SET NULL`,
  `ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_professor_id_fkey FOREIGN KEY (professor_id) REFERENCES public.users(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id)`,
  `ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comment(id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_resolver_id_fkey FOREIGN KEY (resolver_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.category(id)`,
  `ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id)`,
  `ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.preference
    ADD CONSTRAINT preference_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id)`,
  `ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_resolver_id_fkey FOREIGN KEY (resolver_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.update
    ADD CONSTRAINT update_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id)`,
  `ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)`,
  `ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id)`,
  `ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pending_organization_id_fkey FOREIGN KEY (pending_organization_id) REFERENCES public.organization(id)`,
]

/**
 * Baseline: creates the current schema on an empty database and leaves a database that
 * Ecto already migrated untouched.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const [{ present } = { present: false }] = yield* sql<{ present: boolean }>`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present
  `.withoutTransform
  if (present) {
    const latest = yield* sql`
      SELECT 1 FROM public.schema_migrations WHERE version = ${latestEctoVersion}::bigint
    `.withoutTransform
    if (latest.length > 0) return
    return yield* Effect.die(
      new Error(`Ecto migrations are incomplete: run them up to ${latestEctoVersion} first.`),
    )
  }
  for (const statement of schema) {
    yield* sql.unsafe(statement).withoutTransform
  }
  yield* sql`INSERT INTO public.schema_migrations ${sql.insert(ectoVersions.map((version) => ({ version })))}`
    .withoutTransform
})

--
-- PostgreSQL database dump
--

\restrict TwlZEe5PR1rOzNrnlxpEaNHTdCkwgQy5JbVgyHdBe5ISuX9JLCw43qloV3xmT7c

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: oban_job_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.oban_job_state AS ENUM (
    'available',
    'suspended',
    'scheduled',
    'executing',
    'retryable',
    'completed',
    'discarded',
    'cancelled'
);


--
-- Name: ash_elixir_and(anycompatible, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_and("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS NOT NULL THEN $2
    ELSE $1
  END $_$;


--
-- Name: ash_elixir_and(boolean, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_and("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS TRUE THEN $2
    ELSE $1
  END $_$;


--
-- Name: ash_elixir_or(anycompatible, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_or("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE($1, $2) $_$;


--
-- Name: ash_elixir_or(boolean, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_or("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE(NULLIF($1, FALSE), $2) $_$;


--
-- Name: ash_raise_error(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_raise_error(json_data jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$;


--
-- Name: ash_raise_error(jsonb, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_raise_error(json_data jsonb, type_signal anycompatible) RETURNS anycompatible
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$;


--
-- Name: ash_required(anycompatible, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_required(value anycompatible, payload jsonb) RETURNS anycompatible
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF value IS NULL THEN
    RETURN ash_raise_error(payload, value);
  END IF;

  RETURN value;
END;
$$;


--
-- Name: ash_trim_whitespace(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_trim_whitespace(arr text[]) RETURNS text[]
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
END; $$;


--
-- Name: timestamp_from_uuid_v7(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timestamp_from_uuid_v7(_uuid uuid) RETURNS timestamp without time zone
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT to_timestamp(('x0000' || substr(_uuid::TEXT, 1, 8) || substr(_uuid::TEXT, 10, 4))::BIT(64)::BIGINT::NUMERIC / 1000);
$$;


--
-- Name: uuid_generate_v7(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text,
    description text,
    color text DEFAULT '#00683d'::text,
    organization_id uuid,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: classroom_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classroom_memberships (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    role text DEFAULT 'student'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    joined_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    classroom_id uuid NOT NULL,
    user_id uuid NOT NULL,
    invited_by_id uuid
);


--
-- Name: classrooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classrooms (
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
);


--
-- Name: comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    text text,
    sentiment text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid,
    petition_id uuid,
    parent_comment_id uuid,
    hidden_at timestamp without time zone
);


--
-- Name: content_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_reports (
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
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    reference_id text,
    title text NOT NULL,
    body text,
    status text NOT NULL,
    user_id uuid,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: oban_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oban_jobs (
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
);


--
-- Name: TABLE oban_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.oban_jobs IS '14';


--
-- Name: oban_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oban_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oban_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oban_jobs_id_seq OWNED BY public.oban_jobs.id;


--
-- Name: oban_peers; Type: TABLE; Schema: public; Owner: -
--

CREATE UNLOGGED TABLE public.oban_peers (
    name text NOT NULL,
    node text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization (
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
);


--
-- Name: petition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petition (
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
);


--
-- Name: preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preference (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text,
    value text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    user_id uuid
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: signature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signature (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    reason text,
    ip_address text,
    user_agent text,
    is_verified boolean DEFAULT false,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    petition_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: support_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_requests (
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
);


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    jti text NOT NULL,
    subject text NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    purpose text NOT NULL,
    extra_data jsonb,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: update; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.update (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    petition_id uuid
);


--
-- Name: user_petitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_petitions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    petition_id uuid NOT NULL,
    relationship text DEFAULT 'signee'::text NOT NULL,
    bookmarked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
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
);


--
-- Name: oban_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_jobs ALTER COLUMN id SET DEFAULT nextval('public.oban_jobs_id_seq'::regclass);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);


--
-- Name: classroom_memberships classroom_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_pkey PRIMARY KEY (id);


--
-- Name: classrooms classrooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_pkey PRIMARY KEY (id);


--
-- Name: comment comment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_pkey PRIMARY KEY (id);


--
-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);


--
-- Name: oban_jobs non_negative_priority; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.oban_jobs
    ADD CONSTRAINT non_negative_priority CHECK ((priority >= 0)) NOT VALID;


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: oban_jobs oban_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_jobs
    ADD CONSTRAINT oban_jobs_pkey PRIMARY KEY (id);


--
-- Name: oban_peers oban_peers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_peers
    ADD CONSTRAINT oban_peers_pkey PRIMARY KEY (name);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: petition petition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_pkey PRIMARY KEY (id);


--
-- Name: preference preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference
    ADD CONSTRAINT preference_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: signature signature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_pkey PRIMARY KEY (id);


--
-- Name: support_requests support_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (jti);


--
-- Name: update update_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update
    ADD CONSTRAINT update_pkey PRIMARY KEY (id);


--
-- Name: user_petitions user_petitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: classroom_memberships_unique_membership_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX classroom_memberships_unique_membership_index ON public.classroom_memberships USING btree (classroom_id, user_id);


--
-- Name: classrooms_unique_join_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX classrooms_unique_join_code_index ON public.classrooms USING btree (join_code);


--
-- Name: oban_jobs_args_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_args_index ON public.oban_jobs USING gin (args);


--
-- Name: oban_jobs_meta_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_meta_index ON public.oban_jobs USING gin (meta);


--
-- Name: oban_jobs_state_cancelled_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_state_cancelled_at_index ON public.oban_jobs USING btree (state, cancelled_at);


--
-- Name: oban_jobs_state_discarded_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_state_discarded_at_index ON public.oban_jobs USING btree (state, discarded_at);


--
-- Name: oban_jobs_state_queue_priority_scheduled_at_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_state_queue_priority_scheduled_at_id_index ON public.oban_jobs USING btree (state, queue, priority, scheduled_at, id);


--
-- Name: organization_unique_domain_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_unique_domain_index ON public.organization USING btree (domain);


--
-- Name: signature_unique_signature_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX signature_unique_signature_index ON public.signature USING btree (petition_id, user_id);


--
-- Name: users_unique_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_unique_email_index ON public.users USING btree (email);


--
-- Name: category category_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: classroom_memberships classroom_memberships_classroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE CASCADE;


--
-- Name: classroom_memberships classroom_memberships_invited_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: classroom_memberships classroom_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classroom_memberships
    ADD CONSTRAINT classroom_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: classrooms classrooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE SET NULL;


--
-- Name: classrooms classrooms_professor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classrooms
    ADD CONSTRAINT classrooms_professor_id_fkey FOREIGN KEY (professor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment comment_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id);


--
-- Name: comment comment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: content_reports content_reports_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comment(id);


--
-- Name: content_reports content_reports_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: content_reports content_reports_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id);


--
-- Name: content_reports content_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id);


--
-- Name: content_reports content_reports_resolver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_resolver_id_fkey FOREIGN KEY (resolver_id) REFERENCES public.users(id);


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: petition petition_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.category(id);


--
-- Name: petition petition_classroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE CASCADE;


--
-- Name: petition petition_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: petition petition_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition
    ADD CONSTRAINT petition_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: preference preference_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference
    ADD CONSTRAINT preference_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: signature signature_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id) ON DELETE CASCADE;


--
-- Name: signature signature_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: support_requests support_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: support_requests support_requests_resolver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_resolver_id_fkey FOREIGN KEY (resolver_id) REFERENCES public.users(id);


--
-- Name: support_requests support_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: update update_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update
    ADD CONSTRAINT update_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id) ON DELETE CASCADE;


--
-- Name: user_petitions user_petitions_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petition(id);


--
-- Name: user_petitions user_petitions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_petitions
    ADD CONSTRAINT user_petitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: users users_pending_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pending_organization_id_fkey FOREIGN KEY (pending_organization_id) REFERENCES public.organization(id);


--
-- PostgreSQL database dump complete
--

\unrestrict TwlZEe5PR1rOzNrnlxpEaNHTdCkwgQy5JbVgyHdBe5ISuX9JLCw43qloV3xmT7c


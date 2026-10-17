-- The parts of a Supabase project the migrations lean on, recreated on a plain Postgres so the
-- schema and its Row Level Security can be tested without the platform.
--
-- Nothing here is part of the application. It mirrors what Supabase provides: the three roles, the
-- `auth` schema with the session helper the policies call, enough of `storage` for the bucket and
-- its policies, and the default privileges that hand new tables to the API roles, which is what
-- makes the `revoke` migration a real change rather than a no-op.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- The subject of the request's JWT, or null when there is no session. PostgREST always sets the
-- claims, to the anonymous token's own payload when nobody is signed in; the outer nullif is so
-- that an unset or empty setting reads as "no session" rather than failing to parse as JSON.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;

grant all on table storage.buckets, storage.objects to anon, authenticated, service_role;

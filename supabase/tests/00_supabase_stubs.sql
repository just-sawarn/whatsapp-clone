-- Minimal stand-ins for the Supabase-managed pieces so the migrations run on a plain Postgres 15+
-- container. Only used by scripts/test-db.sh; never applied to a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
-- PostgREST exposes the token as JSON in request.jwt.claims; the psql-based tests set the legacy per-claim GUC.
create function auth.uid() returns uuid language sql stable as
$$ select coalesce(
     nullif(current_setting('request.jwt.claim.sub', true), ''),
     nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
   )::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
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
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

create publication supabase_realtime;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Login role PostgREST connects as, switching to anon/authenticated per request (as Supabase does).
create role authenticator noinherit login password 'test';
grant anon, authenticated, service_role to authenticator;

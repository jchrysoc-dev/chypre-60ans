-- Minimal stand-ins for what a Supabase project provides, so migrations and RLS
-- can be tested in-process with PGlite (no Docker, no network).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);

-- Same contract as Supabase: the user id comes from the request's JWT claims.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase grants table privileges to these roles by default; RLS does the filtering.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

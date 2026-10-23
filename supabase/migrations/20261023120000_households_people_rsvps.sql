-- Guests, households and RSVPs, with Row-Level Security.
--
-- Access model:
--   * A guest (role 'guest') sees and edits only their own household's rows.
--   * An organiser (role 'admin', i.e. Mum and Jacques) sees and manages everything.
--   * 'anon' (not logged in) gets nothing.
--   * Logins (auth.users) are created by the server with the secret key when Mum adds a person.
--     Public sign-up is switched off in Supabase, so only invited emails can ever log in.
--   * Roles can only be changed with the secret key or SQL editor (scripts/add-admin.ts),
--     never from the website.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables

create table public.households (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 100),
  created_at timestamptz not null default now()
);
comment on table public.households is 'A group of guests who reply together, e.g. a couple or a family.';

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 100),
  -- Login email. Null for people who don't log in themselves (e.g. children).
  email text unique check (email = lower(btrim(email)) and email like '_%@_%._%'),
  is_child boolean not null default false,
  role text not null default 'guest' check (role in ('guest', 'admin')),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_admin_has_email check (role = 'guest' or email is not null)
);
comment on table public.people is 'Invited guests. Only people with an email can log in.';
create index people_household_id_idx on public.people (household_id);

create table public.rsvps (
  person_id uuid primary key references public.people (id) on delete cascade,
  attending text not null check (attending in ('yes', 'no', 'maybe')),
  arrival_date date,
  departure_date date,
  flight_in text check (length(flight_in) <= 100),
  flight_out text check (length(flight_out) <= 100),
  -- Health data (GDPR special category): only stored with explicit consent.
  dietary text check (length(dietary) <= 500),
  dietary_consent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rsvps_departure_after_arrival check (departure_date >= arrival_date),
  constraint rsvps_dietary_needs_consent check (dietary is null or dietary_consent_at is not null)
);
comment on table public.rsvps is 'One reply per person. Visible only to their household and the organisers.';

-- ---------------------------------------------------------------- helpers for policies
-- Security definer so policies can look up the caller without recursing into people's RLS.
-- They only ever answer questions about the calling user.

create function private.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.people where auth_user_id = (select auth.uid());
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people where auth_user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.my_household_id(), private.is_admin() from public, anon;
grant execute on function private.my_household_id(), private.is_admin() to authenticated;

-- ---------------------------------------------------------------- guard rails on people
-- Logged-in users (database role 'authenticated') may never change role or login link,
-- and only organisers may change email or household. The server's secret key
-- ('service_role') and the SQL editor ('postgres') are not restricted.

create function private.guard_people_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role <> 'guest' then
      raise exception 'Organisers can only be added by Jacques (scripts/add-admin.ts).';
    end if;
    if new.auth_user_id is not null then
      raise exception 'Logins are linked by the server, not from the website.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Organiser status can only be changed by Jacques (scripts/add-admin.ts).';
  end if;
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Logins are linked by the server, not from the website.';
  end if;
  if (new.email is distinct from old.email or new.household_id is distinct from old.household_id)
     and not (select private.is_admin()) then
    raise exception 'Only the organisers can change an email address or household.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger people_guard
before insert or update on public.people
for each row execute function private.guard_people_changes();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rsvps_touch
before update on public.rsvps
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- privileges & RLS

revoke all on public.households, public.people, public.rsvps from anon;

alter table public.households enable row level security;
alter table public.people enable row level security;
alter table public.rsvps enable row level security;

-- households
create policy households_select on public.households
  for select to authenticated
  using (id = (select private.my_household_id()) or (select private.is_admin()));

create policy households_admin_insert on public.households
  for insert to authenticated
  with check ((select private.is_admin()));

create policy households_admin_update on public.households
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy households_admin_delete on public.households
  for delete to authenticated
  using ((select private.is_admin()));

-- people
create policy people_select on public.people
  for select to authenticated
  using (household_id = (select private.my_household_id()) or (select private.is_admin()));

create policy people_admin_insert on public.people
  for insert to authenticated
  with check ((select private.is_admin()));

create policy people_update on public.people
  for update to authenticated
  using (household_id = (select private.my_household_id()) or (select private.is_admin()))
  with check (household_id = (select private.my_household_id()) or (select private.is_admin()));

create policy people_admin_delete on public.people
  for delete to authenticated
  using ((select private.is_admin()));

-- rsvps: anyone in the household can reply for anyone in the household
create policy rsvps_select on public.rsvps
  for select to authenticated
  using (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  );

create policy rsvps_insert on public.rsvps
  for insert to authenticated
  with check (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  );

create policy rsvps_update on public.rsvps
  for update to authenticated
  using (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  )
  with check (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  );

create policy rsvps_delete on public.rsvps
  for delete to authenticated
  using (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  );

-- ---------------------------------------------------------------- keep-alive
-- Called every few days by .github/workflows/supabase-keepalive.yml so the free project
-- is not paused for inactivity. Returns a constant; touches no data.
create function public.ping()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ok';
$$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- The participants directory: what guests choose to share with each other.
--
-- Access model:
--   * Nothing is shared by default. A guest first switches on 'listed' (their name), then
--     each field separately. Every switch is a row in public.sharing_consents with the time
--     it was given. Switching off deletes the row, so it takes effect on the next read.
--   * Only the person themselves can switch their sharing on (consent is personal), never
--     another adult in the household and never an organiser. Organisers can withdraw it.
--   * public.profiles holds the extra details (phone, city, where they stay). A guest reads
--     and writes only their own row; organisers read everything.
--   * Other guests never read people, rsvps, profiles or sharing_consents of another
--     household. They read public.participants(), which returns only listed people and
--     sends null for every field that is not shared. Unshared values never leave Postgres.
--   * Children are shown by first name only, when an adult in the household who is listed
--     switches on 'children'. People without a login are otherwise never listed.
--   * People who replied 'no' are not shown. Their choices are kept in case they change.
--   * The directory closes on 2027-06-30: profiles and consents are deleted (pg_cron), and
--     public.participants() returns nothing from that moment even if the job did not run.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  person_id uuid primary key references public.people (id) on delete cascade,
  -- International format, digits only after the '+', e.g. +35799123456. The server normalises it.
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  phone_whatsapp boolean not null default false,
  city text check (length(btrim(city)) between 1 and 100),
  -- An accommodation file name (content/accommodation/<id>.md), or 'other' with staying_other.
  staying_at text check (staying_at ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  staying_other text check (length(btrim(staying_other)) between 1 and 100),
  -- First time the guest saved their sharing choices (even with everything off). Organisers
  -- use it to tell 'chose not to share' from 'not looked yet'. Set by the database only
  -- (see the column grants below).
  choices_saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_other_needs_staying_other check (staying_other is null or staying_at = 'other')
);
comment on table public.profiles is 'Details a guest may share in the directory. Only the guest and the organisers can read this table.';

create table public.sharing_consents (
  person_id uuid not null references public.people (id) on delete cascade,
  field text not null check (field in ('listed', 'email', 'phone', 'city', 'staying_at', 'dates', 'activities', 'children')),
  -- Set by the database only: guests may not choose this value (see the column grant below).
  granted_at timestamptz not null default now(),
  primary key (person_id, field)
);
comment on table public.sharing_consents is 'One row per field a guest has chosen to share, with the time they chose it. Deleted when they switch it off.';

create trigger profiles_touch
before update on public.profiles
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- helpers

create function private.my_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.people where auth_user_id = (select auth.uid());
$$;

revoke execute on function private.my_person_id() from public, anon;
grant execute on function private.my_person_id() to authenticated;

-- The moment the directory closes and its data is deleted (2027-06-30 03:00 in Cyprus).
create function private.directory_closes_at()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2027-06-30T03:00:00+03:00';
$$;

-- ---------------------------------------------------------------- saving choices

-- Saves the caller's details and the full list of fields they share, in one transaction.
-- Runs as the caller, so the policies below still decide what is allowed. Fields that
-- stay switched on keep the time they were first switched on.
create function public.save_my_sharing(
  p_phone text,
  p_phone_whatsapp boolean,
  p_city text,
  p_staying_at text,
  p_staying_other text,
  p_fields text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_person_id uuid := (select private.my_person_id());
begin
  if v_person_id is null then
    raise exception 'Only guests on the guest list can share their details.' using errcode = '42501';
  end if;

  insert into public.profiles (person_id, phone, phone_whatsapp, city, staying_at, staying_other)
  values (v_person_id, p_phone, coalesce(p_phone_whatsapp, false), p_city, p_staying_at, p_staying_other)
  on conflict (person_id) do update
  set phone = excluded.phone,
      phone_whatsapp = excluded.phone_whatsapp,
      city = excluded.city,
      staying_at = excluded.staying_at,
      staying_other = excluded.staying_other;

  delete from public.sharing_consents
  where person_id = v_person_id and field <> all (coalesce(p_fields, '{}'));

  insert into public.sharing_consents (person_id, field)
  select distinct v_person_id, f from unnest(coalesce(p_fields, '{}')) as f
  on conflict (person_id, field) do nothing;
end;
$$;

revoke execute on function public.save_my_sharing(text, boolean, text, text, text, text[]) from public, anon;
grant execute on function public.save_my_sharing(text, boolean, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------- what other guests may see

-- The directory. Callable by anyone on the guest list. One row per listed person, plus
-- children by first name when an adult in their household shares them. Every field is
-- null unless its owner shares it. activity_ids lists confirmed places only.
create function public.participants()
returns table (
  household_id uuid,
  name text,
  is_child boolean,
  email text,
  phone text,
  phone_whatsapp boolean,
  city text,
  staying_at text,
  staying_other text,
  arrival_date date,
  departure_date date,
  activity_ids text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with shared as (
    select c.person_id, array_agg(c.field) as fields
    from public.sharing_consents c
    group by c.person_id
  ),
  listed as (
    select p.id, p.household_id, p.full_name, p.email, s.fields
    from public.people p
    join shared s on s.person_id = p.id
    where 'listed' = any (s.fields)
      and p.auth_user_id is not null
      and not p.is_child
      and not exists (select 1 from public.rsvps r where r.person_id = p.id and r.attending = 'no')
  )
  select l.household_id,
         l.full_name,
         false,
         case when 'email' = any (l.fields) then l.email end,
         case when 'phone' = any (l.fields) then pr.phone end,
         case when 'phone' = any (l.fields) and pr.phone is not null then pr.phone_whatsapp end,
         case when 'city' = any (l.fields) then pr.city end,
         case when 'staying_at' = any (l.fields) then pr.staying_at end,
         case when 'staying_at' = any (l.fields) then pr.staying_other end,
         case when 'dates' = any (l.fields) then r.arrival_date end,
         case when 'dates' = any (l.fields) then r.departure_date end,
         case when 'activities' = any (l.fields) then array(
           select a.id
           from public.activity_signups su
           join public.activities a on a.id = su.activity_id
           where su.person_id = l.id and su.status = 'confirmed' and a.in_content and not a.cancelled
           order by a.starts_at, a.id
         ) end
  from listed l
  left join public.profiles pr on pr.person_id = l.id
  left join public.rsvps r on r.person_id = l.id
  where (select private.my_household_id()) is not null
    and now() < private.directory_closes_at()

  union all

  select ch.household_id, split_part(btrim(ch.full_name), ' ', 1), true,
         null, null, null, null, null, null, null, null, null
  from public.people ch
  where ch.is_child
    and ch.household_id in (select l.household_id from listed l where 'children' = any (l.fields))
    and not exists (select 1 from public.rsvps r where r.person_id = ch.id and r.attending = 'no')
    and (select private.my_household_id()) is not null
    and now() < private.directory_closes_at();
$$;

revoke execute on function public.participants() from public, anon;
grant execute on function public.participants() to authenticated;

-- ---------------------------------------------------------------- closing the directory

-- Deletes every profile and consent. Does nothing before the closing date, so an early
-- or repeated run is harmless. Scheduled below; can also be run from the SQL editor.
create function private.close_directory()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if now() < private.directory_closes_at() then
    return;
  end if;
  delete from public.sharing_consents;
  delete from public.profiles;
end;
$$;

revoke execute on function private.close_directory() from public, anon, authenticated;

-- pg_cron runs in UTC: 00:00 UTC is 03:00 in Cyprus. Skipped where pg_cron is not
-- available (the in-process test database); participants() closes on time regardless.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('close-participants-directory', '0 0 30 6 *', 'select private.close_directory()');
  end if;
end;
$$;

-- ---------------------------------------------------------------- privileges & RLS

revoke all on public.profiles, public.sharing_consents from anon, authenticated;
-- choices_saved_at and updated_at are left out on purpose: the database sets them.
grant select, delete on public.profiles to authenticated;
grant insert (person_id, phone, phone_whatsapp, city, staying_at, staying_other) on public.profiles to authenticated;
grant update (phone, phone_whatsapp, city, staying_at, staying_other) on public.profiles to authenticated;
-- granted_at is left out on purpose: it always comes from the database clock.
grant select, delete on public.sharing_consents to authenticated;
grant insert (person_id, field) on public.sharing_consents to authenticated;

alter table public.profiles enable row level security;
alter table public.sharing_consents enable row level security;

-- profiles: your own row only (not the rest of your household); organisers read all
-- and may clear a row on request.
create policy profiles_select on public.profiles
  for select to authenticated
  using (person_id = (select private.my_person_id()) or (select private.is_admin()));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (person_id = (select private.my_person_id()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (person_id = (select private.my_person_id()))
  with check (person_id = (select private.my_person_id()));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (person_id = (select private.my_person_id()) or (select private.is_admin()));

-- sharing_consents: only you can switch on; you or an organiser can switch off.
create policy sharing_consents_select on public.sharing_consents
  for select to authenticated
  using (person_id = (select private.my_person_id()) or (select private.is_admin()));

create policy sharing_consents_insert on public.sharing_consents
  for insert to authenticated
  with check (
    person_id = (select private.my_person_id())
    and (
      field <> 'children'
      or exists (
        select 1 from public.people c
        where c.household_id = (select private.my_household_id()) and c.is_child
      )
    )
  );

create policy sharing_consents_delete on public.sharing_consents
  for delete to authenticated
  using (person_id = (select private.my_person_id()) or (select private.is_admin()));

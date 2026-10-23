-- Activities and who signed up to what, with an automatic waiting list.
--
-- Access model:
--   * public.activities is a trusted copy of content/activities/*.md, written only by the
--     server (service_role) through public.sync_activities(). It holds the capacity, so a
--     guest calling Supabase directly can never get round the limit.
--   * Guests read every activity, their own household's sign-ups, and counts (no names).
--   * Sign-ups are created only through public.sign_up(), which decides 'confirmed' or
--     'waitlisted'. Guests have no insert or update privilege, so they cannot pick a status.
--   * Guests cancel by deleting their household's rows, until the activity starts.
--   * Organisers see and remove everything, and can sign anyone up (over capacity if they choose).
--   * People signed up together form a group, and a waiting group is only promoted when all
--     of it fits. A smaller group further back may go first. Families are never split.
--   * Only people whose RSVP is 'yes' or 'maybe' can be signed up (organisers exempt).
--     Changing an RSVP to 'no' removes that person from activities that have not started.

-- ---------------------------------------------------------------- tables

create table public.activities (
  -- The content file name, e.g. 'boat-trip' for content/activities/boat-trip.md.
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  -- Null means no limit.
  capacity integer check (capacity > 0),
  kid_friendly boolean not null default false,
  cancelled boolean not null default false,
  -- False once the content file has been deleted. Its sign-ups are kept for the organisers.
  in_content boolean not null default true,
  -- Build time of the deploy that last wrote this row, so an older server still running
  -- during a deploy cannot overwrite newer content.
  content_built_at timestamptz not null
);
comment on table public.activities is 'Copy of content/activities/*.md, synced by the server. Never edit by hand.';

create table public.activity_signups (
  -- Always increasing, so it is also the order of the waiting list.
  id bigint generated always as identity primary key,
  activity_id text not null references public.activities (id) on delete restrict,
  person_id uuid not null references public.people (id) on delete cascade,
  -- People signed up in one go. A waiting group is promoted all together or not at all.
  group_id uuid not null,
  status text not null check (status in ('confirmed', 'waitlisted')),
  created_at timestamptz not null default now(),
  created_by uuid references public.people (id) on delete set null,
  promoted_at timestamptz,
  unique (activity_id, person_id)
);
comment on table public.activity_signups is 'Who is going to which activity, or waiting for a place.';
create index activity_signups_queue_idx on public.activity_signups (activity_id, status, id);
create index activity_signups_person_id_idx on public.activity_signups (person_id);
create index activity_signups_created_by_idx on public.activity_signups (created_by);

-- ---------------------------------------------------------------- waiting list

-- Confirms waiting groups, oldest first, while places are free. A group that does not fit
-- is skipped, so a smaller group behind it can go. Nothing moves once an activity has
-- started or is cancelled. Callers must already be inside a definer function.
create function private.promote_waitlist(p_activity_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.activities;
  v_free integer;
  v_group record;
begin
  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found or v_activity.cancelled or v_activity.starts_at <= now() then
    return;
  end if;

  if v_activity.capacity is null then
    update public.activity_signups
    set status = 'confirmed', promoted_at = now()
    where activity_id = p_activity_id and status = 'waitlisted';
    return;
  end if;

  select v_activity.capacity - count(*) into v_free
  from public.activity_signups
  where activity_id = p_activity_id and status = 'confirmed';

  for v_group in
    select group_id, count(*) as size
    from public.activity_signups
    where activity_id = p_activity_id and status = 'waitlisted'
    group by group_id
    order by min(id)
  loop
    exit when v_free <= 0;
    if v_group.size <= v_free then
      update public.activity_signups
      set status = 'confirmed', promoted_at = now()
      where activity_id = p_activity_id and group_id = v_group.group_id;
      v_free := v_free - v_group.size;
    end if;
  end loop;
end;
$$;

revoke execute on function private.promote_waitlist(text) from public, anon, authenticated, service_role;

-- After any removal (a guest cancelling, an organiser removing someone, or a person or
-- household being deleted), give the freed places to the waiting list.
create function private.promote_after_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_id text;
begin
  for v_activity_id in select distinct activity_id from removed order by activity_id loop
    perform private.promote_waitlist(v_activity_id);
  end loop;
  return null;
end;
$$;

create trigger activity_signups_promote
after delete on public.activity_signups
referencing old table as removed
for each statement execute function private.promote_after_removal();

-- Someone who is no longer coming leaves the activities that have not started yet.
create function private.leave_activities_when_not_coming()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.activity_signups s
  using public.activities a
  where s.person_id = new.person_id and a.id = s.activity_id and a.starts_at > now();
  return null;
end;
$$;

create trigger rsvps_not_coming
after insert or update of attending on public.rsvps
for each row when (new.attending = 'no')
execute function private.leave_activities_when_not_coming();

revoke execute on function private.promote_after_removal(), private.leave_activities_when_not_coming()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- signing up

-- Signs up people as one group. Returns 'confirmed', 'waitlisted', or 'unchanged' when
-- everyone was already signed up. Organisers may sign up anyone, at any time, and with
-- p_over_capacity give places beyond the limit. Error messages are shown to guests as they are.
create function public.sign_up(p_activity_id text, p_person_ids uuid[], p_over_capacity boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.is_admin();
  v_household uuid := private.my_household_id();
  v_activity public.activities;
  v_new uuid[];
  v_confirmed integer;
  v_status text;
  v_group uuid := gen_random_uuid();
  v_moved integer := 0;
begin
  if v_household is null then
    raise exception 'You are not on the guest list.';
  end if;
  if coalesce(cardinality(p_person_ids), 0) = 0 then
    raise exception 'Please choose at least one person.';
  end if;

  -- One sign-up at a time per activity, so two people cannot take the last place.
  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found or not v_activity.in_content then
    raise exception 'This activity is no longer on the programme.';
  end if;
  if v_activity.cancelled then
    raise exception 'This activity has been cancelled.';
  end if;
  if v_activity.starts_at <= now() and not v_admin then
    raise exception 'This activity has already started, so sign-ups are closed.';
  end if;

  if exists (
    select 1 from unnest(p_person_ids) as chosen (id)
    left join public.people p on p.id = chosen.id
    where p.id is null or (p.household_id <> v_household and not v_admin)
  ) then
    raise exception 'You can only sign up people in your own household.';
  end if;

  if not v_activity.kid_friendly and not v_admin and exists (
    select 1 from public.people where id = any (p_person_ids) and is_child
  ) then
    raise exception 'This activity is not suitable for children.';
  end if;

  if not v_admin and exists (
    select 1 from unnest(p_person_ids) as chosen (id)
    left join public.rsvps r on r.person_id = chosen.id
    where r.attending is null or r.attending = 'no'
  ) then
    raise exception 'Please reply to the invitation (RSVP) first, for everyone you sign up.';
  end if;

  -- An organiser giving a place over capacity also moves these people off the waiting list.
  if v_admin and p_over_capacity then
    update public.activity_signups
    set status = 'confirmed', promoted_at = now()
    where activity_id = p_activity_id and person_id = any (p_person_ids) and status = 'waitlisted';
    get diagnostics v_moved = row_count;
  end if;

  select array_agg(distinct chosen.id) into v_new
  from unnest(p_person_ids) as chosen (id)
  where not exists (
    select 1 from public.activity_signups s where s.activity_id = p_activity_id and s.person_id = chosen.id
  );
  if v_new is null then
    return case when v_moved > 0 then 'confirmed' else 'unchanged' end;
  end if;

  select count(*) into v_confirmed
  from public.activity_signups
  where activity_id = p_activity_id and status = 'confirmed';

  v_status := case
    when v_activity.capacity is null or (v_admin and p_over_capacity) then 'confirmed'
    when v_confirmed + cardinality(v_new) <= v_activity.capacity then 'confirmed'
    else 'waitlisted'
  end;

  insert into public.activity_signups (activity_id, person_id, group_id, status, created_by)
  select p_activity_id, chosen.id, v_group, v_status,
         (select id from public.people where auth_user_id = (select auth.uid()))
  from unnest(v_new) as chosen (id);

  return v_status;
end;
$$;

revoke execute on function public.sign_up(text, uuid[], boolean) from public, anon;
grant execute on function public.sign_up(text, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------- what guests may see

-- Places taken and people waiting per activity. Counts only, never names.
create function public.activity_overview()
returns table (activity_id text, confirmed integer, waitlisted integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id,
         (count(s.id) filter (where s.status = 'confirmed'))::integer,
         (count(s.id) filter (where s.status = 'waitlisted'))::integer
  from public.activities a
  left join public.activity_signups s on s.activity_id = a.id
  where (select private.my_household_id()) is not null
  group by a.id;
$$;

-- For each waiting group in the caller's household: how many people are ahead of it.
create function public.my_waitlist_positions()
returns table (activity_id text, group_id uuid, people_ahead integer)
language sql
stable
security definer
set search_path = ''
as $$
  with waiting as (
    select s.activity_id, s.group_id, count(*) as size, min(s.id) as joined
    from public.activity_signups s
    where s.status = 'waitlisted'
    group by s.activity_id, s.group_id
  )
  select mine.activity_id, mine.group_id,
         coalesce((
           select sum(other.size) from waiting other
           where other.activity_id = mine.activity_id
             and other.joined < mine.joined
         ), 0)::integer
  from waiting mine
  where exists (
    select 1 from public.activity_signups s
    join public.people p on p.id = s.person_id
    where s.group_id = mine.group_id and p.household_id = (select private.my_household_id())
  );
$$;

revoke execute on function public.activity_overview(), public.my_waitlist_positions() from public, anon;
grant execute on function public.activity_overview(), public.my_waitlist_positions() to authenticated;

-- ---------------------------------------------------------------- sync from content

-- Called by the server with the secret key. p_activities is a JSON array of
-- {id, title, starts_at, capacity, kid_friendly, cancelled}. An empty array is ignored,
-- so a broken build can never hide every activity.
create function public.sync_activities(p_activities jsonb, p_built_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_id text;
begin
  if jsonb_typeof(p_activities) <> 'array' or jsonb_array_length(p_activities) = 0 then
    return;
  end if;

  insert into public.activities as a (id, title, starts_at, capacity, kid_friendly, cancelled, in_content, content_built_at)
  select x.id, x.title, x.starts_at, x.capacity, x.kid_friendly, x.cancelled, true, p_built_at
  from jsonb_to_recordset(p_activities)
    as x (id text, title text, starts_at timestamptz, capacity integer, kid_friendly boolean, cancelled boolean)
  on conflict (id) do update
  set title = excluded.title,
      starts_at = excluded.starts_at,
      capacity = excluded.capacity,
      kid_friendly = excluded.kid_friendly,
      cancelled = excluded.cancelled,
      in_content = true,
      content_built_at = excluded.content_built_at
  where a.content_built_at <= excluded.content_built_at;

  update public.activities
  set in_content = false, content_built_at = p_built_at
  where in_content
    and content_built_at <= p_built_at
    and id not in (select x ->> 'id' from jsonb_array_elements(p_activities) as x);

  -- A raised capacity frees places for the waiting list.
  for v_activity_id in select id from public.activities where in_content order by id loop
    perform private.promote_waitlist(v_activity_id);
  end loop;
end;
$$;

revoke execute on function public.sync_activities(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_activities(jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------- privileges & RLS

revoke all on public.activities, public.activity_signups from anon, authenticated;
grant select on public.activities to authenticated;
-- No insert or update: sign-ups are only created through public.sign_up().
grant select, delete on public.activity_signups to authenticated;

alter table public.activities enable row level security;
alter table public.activity_signups enable row level security;

create policy activities_select on public.activities
  for select to authenticated
  using ((select private.my_household_id()) is not null);

create policy activity_signups_select on public.activity_signups
  for select to authenticated
  using (
    (select private.is_admin())
    or person_id in (select id from public.people where household_id = (select private.my_household_id()))
  );

-- Guests cancel for their own household until the activity starts; organisers any time.
create policy activity_signups_delete on public.activity_signups
  for delete to authenticated
  using (
    (select private.is_admin())
    or (
      person_id in (select id from public.people where household_id = (select private.my_household_id()))
      and activity_id in (select id from public.activities where starts_at > now())
    )
  );

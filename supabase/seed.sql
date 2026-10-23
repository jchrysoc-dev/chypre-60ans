-- FAKE data for local development and tests only. NEVER run this on the real project.
-- Real guests are added by Mum in /admin; real organisers with scripts/add-admin.ts.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'ada.organiser@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'ben.example@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'bea.example@example.com'),
  ('00000000-0000-4000-8000-0000000000c1', 'carl.sample@example.com'),
  ('00000000-0000-4000-8000-0000000000d1', 'dora.demo@example.com');

insert into public.households (id, label) values
  ('00000000-0000-4000-8000-00000000a000', 'Organisers (fake)'),
  ('00000000-0000-4000-8000-00000000b000', 'The Example family (fake)'),
  ('00000000-0000-4000-8000-00000000c000', 'Carl Sample (fake)'),
  ('00000000-0000-4000-8000-00000000d000', 'Dora Demo (fake)');

insert into public.people (id, household_id, full_name, email, is_child, role, auth_user_id) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a000', 'Ada Organiser', 'ada.organiser@example.com', false, 'admin', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000ba', '00000000-0000-4000-8000-00000000b000', 'Ben Example', 'ben.example@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000b000', 'Bea Example', 'bea.example@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000bc', '00000000-0000-4000-8000-00000000b000', 'Bobby Example', null, true, 'guest', null),
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-00000000c000', 'Carl Sample', 'carl.sample@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-00000000d000', 'Dora Demo', 'dora.demo@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000d1');

insert into public.rsvps (person_id, attending, arrival_date, departure_date, dietary, dietary_consent_at) values
  ('00000000-0000-4000-8000-0000000000ba', 'yes', '2027-05-26', '2027-06-01', 'Vegetarian', now()),
  ('00000000-0000-4000-8000-0000000000ca', 'maybe', null, null, null, null),
  ('00000000-0000-4000-8000-0000000000da', 'yes', null, null, null, null);

-- Fake activities (the real ones are synced from content/activities by the server).
insert into public.activities (id, title, starts_at, capacity, kid_friendly, cancelled, content_built_at) values
  ('fake-unlimited', 'Fake beach day (no limit)', '2027-05-27T10:00+03:00', null, true, false, '2026-01-01T00:00Z'),
  ('fake-two-places', 'Fake boat trip (2 places)', '2027-05-27T14:00+03:00', 2, true, false, '2026-01-01T00:00Z'),
  ('fake-adults-only', 'Fake wine tasting (adults only)', '2027-05-28T17:00+03:00', null, false, false, '2026-01-01T00:00Z'),
  ('fake-started', 'Fake walk that already started', '2020-01-01T09:00+02:00', null, true, false, '2026-01-01T00:00Z'),
  ('fake-cancelled', 'Fake cruise (cancelled)', '2027-05-29T10:00+03:00', null, true, true, '2026-01-01T00:00Z');

-- FAKE data for local development and tests only. NEVER run this on the real project.
-- Real guests are added by Mum in /admin; real organisers with scripts/add-admin.ts.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'ada.organiser@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'ben.example@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'bea.example@example.com'),
  ('00000000-0000-4000-8000-0000000000c1', 'carl.sample@example.com');

insert into public.households (id, label) values
  ('00000000-0000-4000-8000-00000000a000', 'Organisers (fake)'),
  ('00000000-0000-4000-8000-00000000b000', 'The Example family (fake)'),
  ('00000000-0000-4000-8000-00000000c000', 'Carl Sample (fake)');

insert into public.people (id, household_id, full_name, email, is_child, role, auth_user_id) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a000', 'Ada Organiser', 'ada.organiser@example.com', false, 'admin', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000ba', '00000000-0000-4000-8000-00000000b000', 'Ben Example', 'ben.example@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000b000', 'Bea Example', 'bea.example@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000bc', '00000000-0000-4000-8000-00000000b000', 'Bobby Example', null, true, 'guest', null),
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-00000000c000', 'Carl Sample', 'carl.sample@example.com', false, 'guest', '00000000-0000-4000-8000-0000000000c1');

insert into public.rsvps (person_id, attending, arrival_date, departure_date, dietary, dietary_consent_at) values
  ('00000000-0000-4000-8000-0000000000ba', 'yes', '2027-05-26', '2027-06-01', 'Vegetarian', now()),
  ('00000000-0000-4000-8000-0000000000ca', 'maybe', null, null, null, null);

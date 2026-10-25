/**
 * Read-only health check of the Supabase setup (docs/SETUP_SUPABASE.md).
 * Prints pass/fail and counts only, never keys or personal data. Changes nothing.
 *
 *   node --env-file=.env.local scripts/check-supabase.ts
 */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL = '', SUPABASE_PUBLISHABLE_KEY = '', SUPABASE_SECRET_KEY = '' } = process.env;
let failures = 0;
const report = (ok: boolean, label: string, hint = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && hint ? `\n      → ${hint}` : ''}`);
};

report(Boolean(SUPABASE_URL), 'SUPABASE_URL is set', 'Fill it in .env.local (and save the file).');
report(Boolean(SUPABASE_PUBLISHABLE_KEY), 'SUPABASE_PUBLISHABLE_KEY is set', 'Fill it in .env.local.');
report(Boolean(SUPABASE_SECRET_KEY), 'SUPABASE_SECRET_KEY is set', 'Fill it in .env.local.');
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) process.exit(1);

report(/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(SUPABASE_URL), 'SUPABASE_URL looks like https://<project>.supabase.co', 'Use the Project URL, without /rest/v1 or a trailing path.');
report(SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'), 'Publishable key has the sb_publishable_ format', 'Copy the publishable key from Project Settings → API Keys.');
report(SUPABASE_SECRET_KEY.startsWith('sb_secret_'), 'Secret key has the sb_secret_ format', 'Copy a secret key from Project Settings → API Keys.');
report(SUPABASE_PUBLISHABLE_KEY !== SUPABASE_SECRET_KEY, 'Publishable and secret keys are different', 'The two keys were pasted the same.');

const base = SUPABASE_URL.replace(/\/$/, '');

// Auth settings (public endpoint).
try {
  const res = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  report(res.ok, 'Project reachable with the publishable key', `HTTP ${res.status}: check the URL and publishable key belong to the same project.`);
  if (res.ok) {
    const settings = (await res.json()) as { disable_signup?: boolean; external?: { email?: boolean } };
    report(settings.disable_signup === true, 'Public sign-up is OFF', 'Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".');
    report(settings.external?.email === true, 'Email login provider is enabled', 'Authentication → Sign In / Providers → enable Email.');
  }
} catch {
  report(false, 'Project reachable', 'Could not connect: check SUPABASE_URL and your internet connection.');
}

const anon = createClient(base, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const secret = createClient(base, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Migration applied?
const ping = await anon.rpc('ping');
report(ping.data === 'ok', 'Migration applied (public.ping() exists)', 'Run supabase/migrations/20261023120000_households_people_rsvps.sql in the SQL Editor.');
// A real read, not a head request: head requests don't report a missing table.
const activitiesTable = await secret.from('activities').select('id').limit(1);
report(!activitiesTable.error, 'Activities migration applied (public.activities exists)', 'Run `npx supabase db push` (supabase/migrations/20261023130000_activities_signups.sql).');
const anonSync = await anon.rpc('sync_activities', { p_activities: [], p_built_at: new Date().toISOString() });
// 42501 = permission denied. Any other error (e.g. "function not found") proves nothing.
report(anonSync.error?.code === '42501', 'Not logged in: cannot change activities', 'public.sync_activities is callable without login! Re-run the migration.');

const profilesTable = await secret.from('profiles').select('person_id').limit(1);
report(!profilesTable.error, 'Participants migration applied (public.profiles exists)', 'Run `npx supabase db push` (supabase/migrations/20261024120000_participants_directory.sql).');
const anonDirectory = await anon.rpc('participants');
report(anonDirectory.error?.code === '42501', 'Not logged in: cannot read the participants directory', 'public.participants() is callable without login! Re-run the migration.');

// Not logged in → no access to guest data.
for (const table of ['households', 'people', 'rsvps', 'activities', 'activity_signups', 'profiles', 'sharing_consents'] as const) {
  const { data, error } = await anon.from(table).select('*').limit(1);
  report(Boolean(error) || (data?.length ?? 0) === 0, `Not logged in: cannot read ${table}`, 'Guest data is readable without login! Re-run the migration; do not change RLS.');
}

// Secret key works, and what is in the guest list (counts only).
const count = async (build: (q: ReturnType<typeof secret.from>) => any) => {
  const { count, error } = await build(secret.from('people'));
  return error ? null : (count as number);
};
const people = await count((q) => q.select('id', { count: 'exact', head: true }));
report(people !== null, 'Secret key works', 'Check SUPABASE_SECRET_KEY is a secret key of this project.');
if (people !== null) {
  const admins = await count((q) => q.select('id', { count: 'exact', head: true }).eq('role', 'admin'));
  const linkedAdmins = await count((q) =>
    q.select('id', { count: 'exact', head: true }).eq('role', 'admin').not('auth_user_id', 'is', null),
  );
  const fake = await count((q) => q.select('id', { count: 'exact', head: true }).like('email', '%@example.com'));
  const households = (await secret.from('households').select('id', { count: 'exact', head: true })).count ?? 0;
  console.log(`INFO  Guest list: ${households} households, ${people} people, ${admins} organisers`);
  report((admins ?? 0) >= 1, 'At least one organiser exists', 'Run scripts/add-admin.ts for yourself (step 7).');
  report(admins === linkedAdmins, 'Every organiser has a linked login', 'Re-run scripts/add-admin.ts for that organiser.');
  report(fake === 0, 'No fake @example.com people (seed.sql not run)', 'Fake test data is in the real project: remove those households in /admin.');
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

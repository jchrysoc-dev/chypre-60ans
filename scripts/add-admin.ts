/**
 * Make someone an organiser (admin): creates their login if needed and grants the role.
 * Organisers can't be created from the website on purpose; this needs the secret key.
 *
 *   node --env-file=.env.local scripts/add-admin.ts --email someone@example.com --name "Their Name"
 *
 * Optional: --household "Household name" (default "Organisers"). Re-running is safe.
 */
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, household: { type: 'string', default: 'Organisers' } },
});
const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !name) {
  console.error('Usage: node --env-file=.env.local scripts/add-admin.ts --email someone@example.com --name "Their Name"');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local (see .env.example).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (step: string, error: { message: string } | null) => {
  if (error) {
    console.error(`${step} failed: ${error.message}`);
    process.exit(1);
  }
};

let { data: person } = await db.from('people').select('id, auth_user_id').eq('email', email).maybeSingle();

if (!person) {
  let { data: household } = await db.from('households').select('id').eq('label', values.household!).maybeSingle();
  if (!household) {
    const created = await db.from('households').insert({ label: values.household! }).select('id').single();
    fail('Creating the household', created.error);
    household = created.data;
  }
  const created = await db
    .from('people')
    .insert({ household_id: household!.id, full_name: name, email })
    .select('id, auth_user_id')
    .single();
  fail('Adding the person', created.error);
  person = created.data;
}

if (!person!.auth_user_id) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  fail('Creating the login', error);
  fail('Linking the login', (await db.from('people').update({ auth_user_id: data.user!.id }).eq('id', person!.id)).error);
}

fail('Granting organiser status', (await db.from('people').update({ role: 'admin' }).eq('id', person!.id)).error);
console.log(`Done: ${name} is an organiser and can log in with their email.`);

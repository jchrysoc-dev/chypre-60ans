/**
 * Guest-list changes made by an organiser in /admin.
 *
 * Data changes go through the organiser's own client, so Row-Level Security and the
 * database guard rails apply. Only logins (Supabase auth users) are managed with the
 * secret key, and every person with an email always has exactly one linked login.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import type { createSecretClient, VisitorClient } from './supabase';

type SecretClient = ReturnType<typeof createSecretClient>;

export interface PersonInput {
  full_name: string;
  email: string | null;
  is_child: boolean;
}

/** An error whose message is safe and useful to show to the organiser. */
export class GuestListError extends Error {}

function explain(error: PostgrestError): GuestListError {
  if (error.code === '23505') return new GuestListError('Someone on the guest list already uses this email address.');
  if (error.code === '23514') return new GuestListError('Please check the details: a name or email address looks wrong.');
  if (error.code === 'P0001') return new GuestListError(error.message); // raised by our own database rules
  return new GuestListError('The guest list could not be saved. Please try again.');
}

async function createLogin(secret: SecretClient, personId: string, email: string) {
  const { data, error } = await secret.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) {
    throw new GuestListError(
      error?.code === 'email_exists'
        ? 'This email address already has a login. Ask Jacques to remove the old one in Supabase.'
        : 'The login for this email address could not be created. Please try again.',
    );
  }
  const { error: linkError } = await secret.from('people').update({ auth_user_id: data.user.id }).eq('id', personId);
  if (linkError) {
    await secret.auth.admin.deleteUser(data.user.id);
    throw new GuestListError('The login could not be linked. Please try again.');
  }
}

async function deleteLogin(secret: SecretClient, authUserId: string | null) {
  if (authUserId) await secret.auth.admin.deleteUser(authUserId);
}

export async function addPerson(db: VisitorClient, secret: SecretClient, householdId: string, input: PersonInput) {
  const { data, error } = await db
    .from('people')
    .insert({ household_id: householdId, ...input })
    .select('id')
    .single();
  if (error) throw explain(error);
  if (input.email) {
    try {
      await createLogin(secret, data.id, input.email);
    } catch (loginError) {
      await db.from('people').delete().eq('id', data.id);
      throw loginError;
    }
  }
  return data.id;
}

export async function addHousehold(db: VisitorClient, secret: SecretClient, label: string, people: PersonInput[]) {
  const { data, error } = await db.from('households').insert({ label }).select('id').single();
  if (error) throw explain(error);
  try {
    for (const person of people) await addPerson(db, secret, data.id, person);
  } catch (personError) {
    await removeHousehold(db, secret, data.id).catch(() => undefined);
    throw personError;
  }
  return data.id;
}

export async function updatePerson(db: VisitorClient, secret: SecretClient, personId: string, input: PersonInput) {
  const { data: before, error: readError } = await db
    .from('people')
    .select('full_name, email, is_child, auth_user_id')
    .eq('id', personId)
    .single();
  if (readError) throw new GuestListError('This person is no longer on the guest list.');

  const { error } = await db.from('people').update(input).eq('id', personId);
  if (error) throw explain(error);
  if (before.email === input.email) return;

  try {
    if (before.auth_user_id && input.email) {
      const { error: authError } = await secret.auth.admin.updateUserById(before.auth_user_id, {
        email: input.email,
        email_confirm: true,
      });
      if (authError) throw new GuestListError('The login email could not be changed. Please try again.');
    } else if (before.auth_user_id) {
      await deleteLogin(secret, before.auth_user_id);
    } else if (input.email) {
      await createLogin(secret, personId, input.email);
    }
  } catch (authError) {
    const { auth_user_id: _ignored, ...previous } = before;
    await db.from('people').update(previous).eq('id', personId);
    throw authError;
  }
}

export async function removePerson(db: VisitorClient, secret: SecretClient, personId: string) {
  const { data: person, error: readError } = await db
    .from('people')
    .select('role, auth_user_id')
    .eq('id', personId)
    .single();
  if (readError) return; // already gone
  if (person.role === 'admin') throw new GuestListError('Organisers can only be removed by Jacques.');
  const { error } = await db.from('people').delete().eq('id', personId);
  if (error) throw explain(error);
  await deleteLogin(secret, person.auth_user_id);
}

export async function removeHousehold(db: VisitorClient, secret: SecretClient, householdId: string) {
  const { data: members, error: readError } = await db
    .from('people')
    .select('role, auth_user_id')
    .eq('household_id', householdId);
  if (readError) throw explain(readError);
  if (members.some((m) => m.role === 'admin')) {
    throw new GuestListError('This household includes an organiser, so only Jacques can remove it.');
  }
  const { error } = await db.from('households').delete().eq('id', householdId);
  if (error) throw explain(error);
  await Promise.all(members.map((m) => deleteLogin(secret, m.auth_user_id)));
}

/**
 * Activities and sign-ups on the server.
 *
 * The programme lives in content/activities/*.md. The database keeps a trusted copy
 * (public.activities) so it can enforce capacity itself. This module writes that copy
 * with the secret key, once per server instance and whenever the content changes.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { getCollection, type CollectionEntry } from 'astro:content';
import { VERCEL_ENV } from 'astro:env/server';
import type { ActivitySyncItem, SignupStatus } from './database.types';
import type { Member } from './signups';
import { createSecretClient, type VisitorClient } from './supabase';

export type Activity = CollectionEntry<'activities'>;

/** An error whose message is safe and useful to show to a guest. */
export class SignUpError extends Error {}

export function explain(error: PostgrestError): SignUpError {
  if (error.code === 'P0001') return new SignUpError(error.message); // raised by our own database rules
  return new SignUpError('Your sign-up could not be saved. Please try again.');
}

export async function getActivities(): Promise<Activity[]> {
  return (await getCollection('activities')).sort((a, b) => Date.parse(a.data.start) - Date.parse(b.data.start));
}

let lastSynced: string | undefined;

/**
 * When this build was made (astro.config.mjs). A dev server started before that setting
 * existed doesn't have it, so fall back to when this server started.
 */
const BUILT_AT = typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : new Date().toISOString();

/**
 * Copy the activities from the content into the database, if this server hasn't already.
 * Skipped on Vercel preview deploys, so a draft branch never changes the real programme.
 * A failure is logged and retried on the next request; pages still show the programme.
 */
export async function ensureActivitiesSynced(): Promise<void> {
  if (VERCEL_ENV === 'preview') return;
  const items: ActivitySyncItem[] = (await getActivities()).map(({ id, data }) => ({
    id,
    title: data.title,
    starts_at: data.start,
    capacity: data.capacity ?? null,
    kid_friendly: data.kid_friendly,
    cancelled: data.status === 'cancelled',
  }));
  const payload = JSON.stringify(items);
  if (payload === lastSynced) return;

  try {
    const { error } = await createSecretClient().rpc('sync_activities', { p_activities: items, p_built_at: BUILT_AT });
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
    lastSynced = payload;
  } catch (error) {
    console.error(`[activities] sync failed: ${(error as Error).message}`);
  }
}

/** Everything the Activities page needs about the visitor's household. */
export interface HouseholdView {
  members: Member[];
  /** activity id → person id → status */
  signups: Map<string, Map<string, SignupStatus>>;
  /** activity id → people ahead of this household's waiting group(s) */
  ahead: Map<string, number>;
  /** activity id → counts for everyone */
  counts: Map<string, { confirmed: number; waitlisted: number }>;
}

export async function loadHouseholdView(db: VisitorClient, householdId: string): Promise<HouseholdView> {
  const { data: people = [] } = await db
    .from('people')
    .select('id, full_name, is_child')
    .eq('household_id', householdId)
    .order('is_child')
    .order('full_name');
  const ids = (people ?? []).map((p) => p.id);

  const [{ data: rsvps }, { data: rows }, { data: overview }, { data: positions }] = await Promise.all([
    db.from('rsvps').select('person_id, attending').in('person_id', ids),
    db.from('activity_signups').select('activity_id, person_id, status').in('person_id', ids),
    db.rpc('activity_overview'),
    db.rpc('my_waitlist_positions'),
  ]);

  const attending = new Map((rsvps ?? []).map((r) => [r.person_id, r.attending]));
  const members = (people ?? []).map((p) => ({ ...p, attending: attending.get(p.id) ?? null }));

  const signups = new Map<string, Map<string, SignupStatus>>();
  for (const row of rows ?? []) {
    if (!signups.has(row.activity_id)) signups.set(row.activity_id, new Map());
    signups.get(row.activity_id)!.set(row.person_id, row.status);
  }

  const ahead = new Map<string, number>();
  for (const p of positions ?? []) ahead.set(p.activity_id, Math.min(ahead.get(p.activity_id) ?? Infinity, p.people_ahead));

  const counts = new Map((overview ?? []).map((o) => [o.activity_id, { confirmed: o.confirmed, waitlisted: o.waitlisted }]));
  return { members, signups, ahead, counts };
}

/** One person's sign-up, as the organisers see it. */
export interface AdminSignup {
  personId: string;
  fullName: string;
  household: string;
  isChild: boolean;
  status: SignupStatus;
  /** For people waiting: how many people are ahead of their group. */
  peopleAhead?: number;
  /** For people waiting: 1 for the first group in line, 2 for the next… */
  groupNumber?: number;
  signedUpAt: string;
  promotedAt: string | null;
}

export interface AdminActivity {
  id: string;
  title: string;
  start: string;
  capacity: number | null;
  cancelled: boolean;
  inContent: boolean;
  going: AdminSignup[];
  waiting: AdminSignup[];
}

/** Every activity in the database with who is going and who is waiting, in order. Organisers only (RLS). */
export async function loadAdminActivities(db: VisitorClient): Promise<AdminActivity[]> {
  const [{ data: activities }, { data: signups }, { data: everyone }, { data: households }] = await Promise.all([
    db.from('activities').select('*').order('starts_at'),
    db.from('activity_signups').select('*').order('id'),
    db.from('people').select('id, full_name, is_child, household_id'),
    db.from('households').select('id, label'),
  ]);
  const person = new Map((everyone ?? []).map((p) => [p.id, p]));
  const household = new Map((households ?? []).map((h) => [h.id, h.label]));

  return (activities ?? []).map((a) => {
    const rows = (signups ?? []).filter((s) => s.activity_id === a.id);
    const toView = (s: (typeof rows)[number]): AdminSignup => {
      const p = person.get(s.person_id);
      return {
        personId: s.person_id,
        fullName: p?.full_name ?? '(removed)',
        household: (p && household.get(p.household_id)) ?? '',
        isChild: p?.is_child ?? false,
        status: s.status,
        signedUpAt: s.created_at,
        promotedAt: s.promoted_at,
      };
    };

    // Rows come ordered by id, which is the queue order; groups keep the place of their first member.
    const waiting: AdminSignup[] = [];
    const groupOrder: string[] = [];
    for (const s of rows.filter((r) => r.status === 'waitlisted')) {
      if (!groupOrder.includes(s.group_id)) groupOrder.push(s.group_id);
    }
    let ahead = 0;
    groupOrder.forEach((groupId, index) => {
      const members = rows.filter((r) => r.group_id === groupId && r.status === 'waitlisted');
      for (const s of members) waiting.push({ ...toView(s), peopleAhead: ahead, groupNumber: index + 1 });
      ahead += members.length;
    });

    return {
      id: a.id,
      title: a.title,
      start: a.starts_at,
      capacity: a.capacity,
      cancelled: a.cancelled,
      inContent: a.in_content,
      going: rows.filter((r) => r.status === 'confirmed').map(toView),
      waiting,
    };
  });
}

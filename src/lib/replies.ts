/**
 * Party replies (RSVPs) as the organisers see them: everyone on the guest list, with their
 * reply if they have sent one. Read through the organiser's own client, so RLS applies.
 */
import type { Attending, Rsvp } from './database.types';
import type { VisitorClient } from './supabase';

export interface GuestReply {
  personId: string;
  fullName: string;
  household: string;
  isChild: boolean;
  reply?: Rsvp;
}

export async function loadReplies(db: VisitorClient): Promise<GuestReply[]> {
  const [{ data: everyone }, { data: households }, { data: rsvps }] = await Promise.all([
    db.from('people').select('id, full_name, is_child, household_id').order('full_name'),
    db.from('households').select('id, label'),
    db.from('rsvps').select('*'),
  ]);
  const household = new Map((households ?? []).map((h) => [h.id, h.label]));
  const reply = new Map((rsvps ?? []).map((r) => [r.person_id, r]));
  return (everyone ?? []).map((p) => ({
    personId: p.id,
    fullName: p.full_name,
    household: household.get(p.household_id) ?? '',
    isChild: p.is_child,
    reply: reply.get(p.id),
  }));
}

export type Tally = Record<Attending | 'none', { adults: number; children: number }>;

export function tally(replies: GuestReply[]): Tally {
  const counts: Tally = {
    yes: { adults: 0, children: 0 },
    maybe: { adults: 0, children: 0 },
    no: { adults: 0, children: 0 },
    none: { adults: 0, children: 0 },
  };
  for (const r of replies) counts[r.reply?.attending ?? 'none'][r.isChild ? 'children' : 'adults']++;
  return counts;
}

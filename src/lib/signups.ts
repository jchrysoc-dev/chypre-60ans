/**
 * Rules for the activity sign-up form that don't need the database, so they can be tested
 * on their own. The database enforces the same rules (supabase/migrations); these only
 * decide what the page shows and which changes to send.
 */
import type { Attending, SignupStatus } from './database.types';

export interface Member {
  id: string;
  full_name: string;
  is_child: boolean;
  attending: Attending | null;
}

/** Why sign-ups for a whole activity are closed, if they are. */
export type Closed = 'cancelled' | 'started' | 'removed' | null;

export function closedReason(activity: { cancelled: boolean; start: string; inContent?: boolean }, now = new Date()): Closed {
  if (activity.inContent === false) return 'removed';
  if (activity.cancelled) return 'cancelled';
  if (Date.parse(activity.start) <= now.getTime()) return 'started';
  return null;
}

/** Why one person can't be ticked for an activity, if they can't. */
export type Blocked = 'rsvp' | 'not-coming' | 'child' | null;

export function blockedReason(member: Member, activity: { kid_friendly: boolean }): Blocked {
  if (member.attending === 'no') return 'not-coming';
  if (member.attending !== 'yes' && member.attending !== 'maybe') return 'rsvp';
  if (member.is_child && !activity.kid_friendly) return 'child';
  return null;
}

/**
 * Which sign-ups to create and which to cancel, from what is saved now and what is ticked
 * in the form. People who can't be ticked are left as they are.
 */
export function planChanges(
  current: ReadonlyMap<string, SignupStatus>,
  ticked: ReadonlySet<string>,
  editable: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  const add = [...ticked].filter((id) => editable.has(id) && !current.has(id));
  const remove = [...current.keys()].filter((id) => editable.has(id) && !ticked.has(id));
  return { add, remove };
}

/** ["Ben"] → "Ben"; ["Ben", "Bea"] → "Ben and Bea"; ["Ben", "Bea", "Bobby"] → "Ben, Bea and Bobby". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** First names only, as guests call each other. */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0];

/** "1 person" / "3 people". */
export const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** What the places line says, e.g. "8 of 20 places left" or "Full, 3 waiting". */
export function placesLine(capacity: number | undefined, confirmed: number, waitlisted: number): string {
  if (!capacity) return confirmed === 0 ? 'No limit' : `No limit, ${people(confirmed)} going`;
  const left = capacity - confirmed;
  if (left > 0) {
    return `${left} of ${capacity} ${capacity === 1 ? 'place' : 'places'} left${waitlisted ? `, ${waitlisted} waiting` : ''}`;
  }
  return `Full${waitlisted ? `, ${waitlisted} waiting` : ''}`;
}

/**
 * The participants directory: what each sharing switch means, phone numbers, and grouping
 * the entries into households. No database here, so it can be tested on its own. Who may
 * see what is decided by the database (supabase/migrations/20261024120000_participants_directory.sql).
 */
import type { Participant, SharingField } from './database.types';

/** The day the directory closes and what people shared is deleted (private.directory_closes_at() in the migration). */
export const DIRECTORY_CLOSES = '2027-06-30';

/** The switches on "My details", in the order shown. `listed` comes first and unlocks the others. */
export const SWITCHES: { field: SharingField; label: string; hint?: string }[] = [
  { field: 'listed', label: 'Show me on the Participants page', hint: 'Your name only. Everything below needs this switched on.' },
  { field: 'email', label: 'My email address', hint: 'The one you log in with.' },
  { field: 'phone', label: 'My phone number' },
  { field: 'city', label: 'Where I live (city or country)' },
  { field: 'staying_at', label: 'Where I am staying in Cyprus', hint: 'Also shown on the Accommodation page, to help with car-sharing.' },
  { field: 'dates', label: 'When I arrive and leave', hint: 'The dates from your RSVP.' },
  { field: 'activities', label: 'The activities I have a place on', hint: 'Not the waiting lists.' },
  { field: 'children', label: 'The first names of the children in my household' },
];

export const FIELD_LABEL = Object.fromEntries(SWITCHES.map((s) => [s.field, s.label])) as Record<SharingField, string>;

export class PhoneError extends Error {}

/**
 * Turns what people type into the stored form, digits after a '+': "+357 99 123 456",
 * "00357 99123456" and "(+33) 6 12 34 56 78" all work. Blank means no number.
 * A number without a country code is refused, because guests come from several countries.
 */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/[^\d\s+().\-/]/.test(trimmed)) throw new PhoneError('A phone number can only have digits, spaces and a + sign.');
  let digits = trimmed.replace(/[\s().\-/]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) {
    throw new PhoneError('Please start the phone number with your country code, for example +357 for Cyprus or +33 for France.');
  }
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) throw new PhoneError('This phone number looks too short or too long. Please check it.');
  return digits;
}

/** "+35799123456" → "+357 991 234 56". Grouped in threes for reading: national formats differ too much to guess. */
export function displayPhone(phone: string): string {
  return `+${phone.slice(1).replace(/(\d{3})(?=\d)/g, '$1 ')}`;
}

export const whatsappLink = (phone: string) => `https://wa.me/${phone.slice(1)}`;

/** The WhatsApp group invite link, if it is set and really a WhatsApp group link. */
export function whatsappGroup(url: string | undefined): string | undefined {
  return url && /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(url.trim()) ? url.trim() : undefined;
}

export interface Household {
  adults: Participant[];
  children: string[];
}

/** One card per household: listed adults first, then the children's first names. */
export function groupByHousehold(entries: Participant[], compare: (a: string, b: string) => number): Household[] {
  const households = new Map<string, Household>();
  for (const entry of entries) {
    const household = households.get(entry.household_id) ?? { adults: [], children: [] };
    if (entry.is_child) household.children.push(entry.name);
    else household.adults.push(entry);
    households.set(entry.household_id, household);
  }
  const list = [...households.values()].filter((h) => h.adults.length > 0);
  for (const h of list) {
    h.adults.sort((a, b) => compare(a.name, b.name));
    h.children.sort(compare);
  }
  return list.sort((a, b) => compare(a.adults[0].name, b.adults[0].name));
}

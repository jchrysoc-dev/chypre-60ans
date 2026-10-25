import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Participant } from '../src/lib/database.types';
import { byName } from '../src/lib/format';
import {
  DIRECTORY_CLOSES,
  displayPhone,
  groupByHousehold,
  normalisePhone,
  PhoneError,
  whatsappGroup,
  whatsappLink,
} from '../src/lib/sharing';

describe('phone numbers', () => {
  it('accepts the ways people type international numbers', () => {
    expect(normalisePhone('+357 99 123 456')).toBe('+35799123456');
    expect(normalisePhone('00357 99123456')).toBe('+35799123456');
    expect(normalisePhone('(+33) 6.12.34-56-78')).toBe('+33612345678');
    expect(normalisePhone('   ')).toBeNull();
  });

  it('refuses numbers without a country code, letters, and wrong lengths', () => {
    expect(() => normalisePhone('06 12 34 56 78')).toThrow(/country code/);
    expect(() => normalisePhone('+357 call me')).toThrow(PhoneError);
    expect(() => normalisePhone('+357 12')).toThrow(/too short or too long/);
    expect(() => normalisePhone('+0 123 456 789')).toThrow(/too short or too long/);
  });

  it('shows and links numbers', () => {
    expect(displayPhone('+35799123456')).toBe('+357 991 234 56');
    expect(whatsappLink('+35799123456')).toBe('https://wa.me/35799123456');
  });
});

describe('WhatsApp group link', () => {
  it('only accepts a real WhatsApp group invite', () => {
    expect(whatsappGroup('https://chat.whatsapp.com/AbC123')).toBe('https://chat.whatsapp.com/AbC123');
    expect(whatsappGroup('https://evil.example/chat.whatsapp.com/x')).toBeUndefined();
    expect(whatsappGroup('http://chat.whatsapp.com/AbC123')).toBeUndefined();
    expect(whatsappGroup(undefined)).toBeUndefined();
  });
});

describe('households', () => {
  const entry = (household_id: string, name: string, is_child = false): Participant => ({
    household_id, name, is_child, email: null, phone: null, phone_whatsapp: null, city: null,
    staying_at: null, staying_other: null, arrival_date: null, departure_date: null, activity_ids: null,
  });

  it('groups by household, adults then children, in name order', () => {
    const grouped = groupByHousehold(
      [entry('b', 'Zoe Test'), entry('a', 'Mia Test'), entry('a', 'Tom', true), entry('a', 'Ada Test'), entry('a', 'Bob', true)],
      byName,
    );
    expect(grouped.map((h) => [h.adults.map((a) => a.name), h.children])).toEqual([
      [['Ada Test', 'Mia Test'], ['Bob', 'Tom']],
      [['Zoe Test'], []],
    ]);
  });
});

it('the closing date matches the database', () => {
  const migration = readFileSync('supabase/migrations/20261024120000_participants_directory.sql', 'utf8');
  expect(migration).toContain(`timestamptz '${DIRECTORY_CLOSES}T03:00:00+03:00'`);
});

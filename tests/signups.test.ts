import { describe, expect, it } from 'vitest';
import type { SignupStatus } from '../src/lib/database.types';
import {
  blockedReason,
  closedReason,
  householdBlocked,
  joinNames,
  placesHint,
  placesLine,
  planChanges,
  type Member,
} from '../src/lib/signups';

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'p1',
  full_name: 'Ben Example',
  is_child: false,
  attending: 'yes',
  ...overrides,
});

describe('planChanges', () => {
  const current = new Map<string, SignupStatus>([
    ['ben', 'confirmed'],
    ['bea', 'waitlisted'],
  ]);

  it('adds newly ticked people and cancels unticked ones', () => {
    const editable = new Set(['ben', 'bea', 'bobby']);
    expect(planChanges(current, new Set(['ben', 'bobby']), editable)).toEqual({ add: ['bobby'], remove: ['bea'] });
  });

  it('leaves people who are not editable alone, ticked or not', () => {
    const editable = new Set(['ben']);
    expect(planChanges(current, new Set(['bobby']), editable)).toEqual({ add: [], remove: ['ben'] });
  });

  it('changes nothing when the form matches what is saved', () => {
    expect(planChanges(current, new Set(['ben', 'bea']), new Set(['ben', 'bea']))).toEqual({ add: [], remove: [] });
  });
});

describe('who can be ticked', () => {
  it('needs a reply of yes or maybe', () => {
    expect(blockedReason(member({ attending: null }), { kid_friendly: true })).toBe('rsvp');
    expect(blockedReason(member({ attending: 'no' }), { kid_friendly: true })).toBe('not-coming');
    expect(blockedReason(member({ attending: 'maybe' }), { kid_friendly: true })).toBeNull();
  });

  it('keeps children off activities that are not for them', () => {
    expect(blockedReason(member({ is_child: true }), { kid_friendly: false })).toBe('child');
    expect(blockedReason(member({ is_child: true }), { kid_friendly: true })).toBeNull();
  });
});

describe('closedReason', () => {
  const now = new Date('2027-05-27T09:00+03:00');
  it('closes cancelled, started and removed activities', () => {
    expect(closedReason({ cancelled: true, start: '2027-05-28T10:00+03:00' }, now)).toBe('cancelled');
    expect(closedReason({ cancelled: false, start: '2027-05-27T09:00+03:00' }, now)).toBe('started');
    expect(closedReason({ cancelled: false, start: '2027-05-28T10:00+03:00', inContent: false }, now)).toBe('removed');
    expect(closedReason({ cancelled: false, start: '2027-05-28T10:00+03:00' }, now)).toBeNull();
  });
});

describe('wording', () => {
  it('joins names the way people write them', () => {
    expect(joinNames(['Ben'])).toBe('Ben');
    expect(joinNames(['Ben', 'Bea'])).toBe('Ben and Bea');
    expect(joinNames(['Ben', 'Bea', 'Bobby'])).toBe('Ben, Bea and Bobby');
  });

  it('describes the places left', () => {
    expect(placesLine(undefined, 0, 0)).toBe('No limit');
    expect(placesLine(undefined, 4, 0)).toBe('No limit, 4 people going');
    expect(placesLine(20, 12, 0)).toBe('8 of 20 places left');
    expect(placesLine(20, 20, 3)).toBe('Full, 3 waiting');
    expect(placesLine(2, 1, 3)).toBe('1 of 2 places left, 3 waiting');
  });
});

describe('householdBlocked', () => {
  it('is null as soon as one person can be ticked', () => {
    expect(householdBlocked(['rsvp', null])).toBeNull();
    expect(householdBlocked([])).toBeNull();
  });

  it('asks for a reply first, then explains "not coming", then "adults only"', () => {
    expect(householdBlocked(['child', 'rsvp', 'not-coming'])).toBe('rsvp');
    expect(householdBlocked(['not-coming', 'child'])).toBe('not-coming');
    expect(householdBlocked(['child'])).toBe('child');
  });
});

describe('placesHint', () => {
  it('explains the waiting list only when the activity is full', () => {
    expect(placesHint(12, 12)).toMatch(/waiting list/);
    expect(placesHint(12, 13)).toMatch(/waiting list/);
    expect(placesHint(12, 11)).toBeUndefined();
    expect(placesHint(undefined, 40)).toBeUndefined();
  });
});

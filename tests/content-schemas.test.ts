import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accommodationSchema, activitySchema, eventSchema, photoSchema } from '../src/lib/content-schemas';

const activity = {
  title: 'Boat trip',
  summary: 'A trip.',
  start: '2027-05-27T10:00+03:00',
  meeting_point: 'Harbour',
  cost_eur: 45,
};

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('activitySchema', () => {
  it('accepts a minimal activity and defaults kid_friendly to false', () => {
    const result = activitySchema.parse(activity);
    expect(result.kid_friendly).toBe(false);
    expect(result.capacity).toBeUndefined();
    expect(result.status).toBe('scheduled');
  });

  it('accepts status: cancelled and rejects other statuses, with a readable message', () => {
    expect(activitySchema.parse({ ...activity, status: 'cancelled' }).status).toBe('cancelled');
    const result = activitySchema.safeParse({ ...activity, status: 'postponed' });
    expect(messages(result)).toEqual(['"status" must be "scheduled" or "cancelled" (or left out).']);
  });

  it('rejects a time without the Cyprus time-zone offset, with a readable message', () => {
    const result = activitySchema.safeParse({ ...activity, start: '2027-05-27T10:00' });
    expect(messages(result)).toEqual([expect.stringContaining('+03:00')]);
  });

  it('rejects an unquoted YAML timestamp (parsed as a Date) and asks for quotes', () => {
    const result = activitySchema.safeParse({ ...activity, start: new Date('2027-05-27T07:00:00Z') });
    expect(messages(result)[0]).toContain('in quotes');
  });

  it('rejects an end time before the start time', () => {
    const result = activitySchema.safeParse({ ...activity, end: '2027-05-27T09:00+03:00' });
    expect(messages(result)).toEqual(['The end time must be after the start time.']);
  });

  it.each([0, 2.5, -3])('rejects capacity %s', (capacity) => {
    expect(activitySchema.safeParse({ ...activity, capacity }).success).toBe(false);
  });

  it('rejects a cost written as text', () => {
    const result = activitySchema.safeParse({ ...activity, cost_eur: '45 euros' });
    expect(messages(result)[0]).toContain('number of euros');
  });
});

describe('accommodationSchema', () => {
  const place = {
    name: 'Hotel',
    summary: 'Nice.',
    area: 'Seafront',
    kind: 'hotel',
    price_eur_per_night: { min: 90, max: 160 },
  };

  it('accepts a valid place', () => {
    expect(accommodationSchema.safeParse(place).success).toBe(true);
  });

  it('rejects max price below min price', () => {
    const result = accommodationSchema.safeParse({ ...place, price_eur_per_night: { min: 100, max: 50 } });
    expect(messages(result)).toEqual(['The maximum price must not be below the minimum.']);
  });

  it('rejects a booking link that is not a web address', () => {
    expect(accommodationSchema.safeParse({ ...place, booking_url: 'call them' }).success).toBe(false);
  });
});

describe('eventSchema', () => {
  const event = {
    title: 'A 60th birthday',
    honoree_display_name: 'TBD',
    timezone: 'Europe/Nicosia',
    currency: 'EUR',
    week: { start_date: 'TBD', end_date: 'TBD' },
    party: { date: '2027-05-29', start: 'TBD', end: 'TBD', dress_code: 'TBD' },
    venue: { name: 'TBD', address: 'TBD', town: 'TBD', country: 'Cyprus', gps: 'TBD', maps_url: 'TBD' },
    contact_note: 'Ask on WhatsApp.',
  };

  it('accepts TBD placeholders', () => {
    expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it('converts an unquoted YAML date (Date object) back to YYYY-MM-DD', () => {
    const result = eventSchema.parse({ ...event, party: { ...event.party, date: new Date('2027-05-29T00:00:00Z') } });
    expect(result.party.date).toBe('2027-05-29');
  });

  it('rejects GPS coordinates outside Cyprus', () => {
    const result = eventSchema.safeParse({ ...event, venue: { ...event.venue, gps: { lat: 48.85, lng: 2.35 } } });
    expect(result.success).toBe(false);
  });

  it('rejects a party that ends before it starts', () => {
    const party = { ...event.party, start: '2027-05-29T19:00+03:00', end: '2027-05-29T18:00+03:00' };
    expect(messages(eventSchema.safeParse({ ...event, party }))).toEqual([
      'The party end time must be after its start time.',
    ]);
  });
});

describe('photoSchema', () => {
  const photo = {
    unsplash_id: 'photo-1701121685501-03d44cca164c',
    alt: 'Waves at sunset.',
    caption: 'Sunset near Paphos',
    credit_name: 'Sergei Gussev on Unsplash',
    credit_url: 'https://unsplash.com/photos/ZjojRyMGTro',
    aspect: '3:2',
  };

  it('accepts a photo and defaults the focus to the centre', () => {
    expect(photoSchema.parse(photo).focus).toBe('50% 50%');
  });

  it('rejects a page that does not start with a slash, with a readable message', () => {
    expect(messages(photoSchema.safeParse({ ...photo, page: 'activities' }))[0]).toContain('start with /');
  });

  it('rejects an aspect that is not offered', () => {
    expect(messages(photoSchema.safeParse({ ...photo, aspect: '1:1' }))[0]).toContain('3:2');
  });

  it('has an image file for every photo in content/photos', () => {
    const sizes = JSON.parse(readFileSync(new URL('../public/photos/sizes.json', import.meta.url), 'utf-8'));
    const ids = readdirSync(new URL('../content/photos/', import.meta.url))
      .filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
      .map((name) => name.replace(/\.yaml$/, ''));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(sizes[id], `${id} has no image files: run npm run photos`).toBeTruthy();
      for (const width of sizes[id]) {
        const file = new URL(`../public/photos/${id}-${width}.webp`, import.meta.url);
        expect(statSync(file).size, `${id}-${width}.webp is over 200 KB`).toBeLessThanOrEqual(200 * 1024);
      }
    }
  });
});

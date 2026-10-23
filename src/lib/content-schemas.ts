/**
 * Schemas for every file in /content.
 *
 * Shared by the Astro build (src/content.config.ts), the tests and
 * scripts/check-content.ts, so a file that passes one passes all of them.
 * Error messages are written for a non-technical reader. They are what Mum or
 * Jacques see when a file is wrong. Field-by-field docs: docs/CONTENT_SCHEMA.md
 */
import { z } from 'astro/zod';

/** The literal "TBD" marks a fact that is not decided yet. Pages show "To be confirmed". */
export const TBD = 'TBD' as const;
const tbd = z.literal(TBD);

/** Text of at most 200 characters unless said otherwise, so pages stay tidy. */
const text = (field: string, max = 200) =>
  z
    .string({ error: `"${field}" must be some text.` })
    .trim()
    .min(1, { error: `"${field}" is empty.` })
    .max(max, { error: `"${field}" is too long (the limit is ${max} letters). Please shorten it.` });

/** How many single-letter edits turn a into b (used to suggest the field someone meant to type). */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/**
 * An object that refuses fields it does not know. Without this, a misspelt field
 * (e.g. "captian") would be silently ignored and the information would never show.
 */
function strictObject<T extends z.ZodRawShape>(shape: T) {
  const known = Object.keys(shape);
  return z.strictObject(shape, {
    error: (issue) => {
      if (issue.code !== 'unrecognized_keys') return undefined;
      const keys = (issue as unknown as { keys: string[] }).keys;
      return keys
        .map((key) => {
          const guess = known.find((name) => editDistance(key.toLowerCase(), name) <= Math.max(2, Math.floor(name.length / 4)));
          return `"${key}" is not a field this file knows${guess ? `. Did you mean "${guess}"?` : `. The fields are: ${known.join(', ')}.`}`;
        })
        .join(' ');
    },
  });
}

/**
 * A calendar date, e.g. 2027-05-29.
 * YAML turns unquoted dates into Date objects, so convert those back to text first.
 */
export const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.iso.date({ error: 'Dates must look like 2027-05-29 (year-month-day).' }),
);

/**
 * A date and time with Cyprus time-zone offset, e.g. 2027-05-29T19:00+03:00.
 * The offset is required so nobody (person or LLM) has to guess the time zone.
 */
export const isoDateTime = z.preprocess(
  (value) => (value instanceof Date ? 'needs-quotes' : value),
  z.iso.datetime({
    offset: true,
    local: false,
    precision: -1, // minutes, no seconds: one canonical format everywhere
    error: 'Date-times must look like "2027-05-29T19:00+03:00" (in quotes, with the +03:00 time zone).',
  }),
);

const url = (field: string) =>
  z.url({ protocol: /^https$/, error: `"${field}" must be a full web address starting with https://` });

const euros = (field: string) =>
  z.number({ error: `"${field}" must be a number of euros, e.g. 25 (use 0 for free).` }).min(0, {
    error: `"${field}" cannot be negative.`,
  });

const link = strictObject({ label: text('label', 100), url: url('url') });

/* ---------- content/event.yaml: the one canonical source for event facts ---------- */

export const eventSchema = strictObject({
    title: text('title', 100),
    honoree_display_name: z.union([tbd, text('honoree_display_name')]),
    timezone: z.literal('Europe/Nicosia'),
    currency: z.literal('EUR'),
    week: strictObject({
      start_date: z.union([tbd, isoDate]),
      end_date: z.union([tbd, isoDate]),
    }),
    party: strictObject({
      date: isoDate,
      start: z.union([tbd, isoDateTime]),
      end: z.union([tbd, isoDateTime]),
      dress_code: z.union([tbd, text('dress_code')]),
    }),
    venue: strictObject({
      name: z.union([tbd, text('venue.name', 100)]),
      address: z.union([tbd, text('venue.address')]),
      town: z.union([tbd, text('venue.town')]),
      country: z.literal('Cyprus'),
      gps: z.union([
        tbd,
        strictObject({
          lat: z.number().min(34).max(36, { error: 'Latitude must be in Cyprus (between 34 and 36).' }),
          lng: z.number().min(32).max(35, { error: 'Longitude must be in Cyprus (between 32 and 35).' }),
        }),
      ]),
      maps_url: z.union([tbd, url('venue.maps_url')]),
    }),
    /** How to reach the organisers. Text only, with no phone numbers or emails (they live behind login in the database). */
    contact_note: text('contact_note', 300),
  })
  .superRefine((event, ctx) => {
    const { start, end } = event.party;
    if (start !== TBD && end !== TBD && Date.parse(end) <= Date.parse(start)) {
      ctx.addIssue({ code: 'custom', path: ['party', 'end'], message: 'The party end time must be after its start time.' });
    }
    const { start_date, end_date } = event.week;
    if (start_date !== TBD && end_date !== TBD && end_date < start_date) {
      ctx.addIssue({ code: 'custom', path: ['week', 'end_date'], message: 'The last day of the week must be after the first day.' });
    }
  });

/* ---------- content/*.md: standalone pages (welcome, thank-you, privacy) ---------- */

export const pageSchema = strictObject({
  title: text('title', 100),
  /** One-sentence summary, used in llms.txt and link previews. */
  summary: text('summary'),
});

/* ---------- content/activities/<id>.md (the file name is the stable activity id) ---------- */

export const activitySchema = strictObject({
    title: text('title', 100),
    summary: text('summary'),
    start: isoDateTime,
    end: isoDateTime.optional(),
    meeting_point: text('meeting_point', 150),
    /** Maximum number of people. Leave out for unlimited. When full, new sign-ups go on the waitlist. */
    capacity: z
      .number({ error: '"capacity" must be a whole number of people, or left out for unlimited.' })
      .int({ error: '"capacity" must be a whole number of people.' })
      .min(1, { error: '"capacity" must be at least 1 (leave it out for unlimited).' })
      .optional(),
    cost_eur: euros('cost_eur'),
    cost_note: text('cost_note', 150).optional(),
    kid_friendly: z.boolean({ error: '"kid_friendly" must be true or false.' }).default(false),
    /** "cancelled" stops sign-ups and shows the activity as cancelled. Never delete the file instead. */
    status: z
      .enum(['scheduled', 'cancelled'], { error: '"status" must be "scheduled" or "cancelled" (or left out).' })
      .default('scheduled'),
  })
  .superRefine((activity, ctx) => {
    if (activity.end && Date.parse(activity.end) <= Date.parse(activity.start)) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'The end time must be after the start time.' });
    }
  });

/* ---------- content/accommodation/<id>.md ---------- */

export const accommodationSchema = strictObject({
    name: text('name', 100),
    summary: text('summary'),
    area: text('area', 100),
    kind: z.enum(['hotel', 'villa', 'apartment', 'guesthouse', 'other'], {
      error: '"kind" must be one of: hotel, villa, apartment, guesthouse, other.',
    }),
    price_eur_per_night: strictObject({ min: euros('price_eur_per_night.min'), max: euros('price_eur_per_night.max') }),
    booking_url: url('booking_url').optional(),
    distance_to_venue_km: z.number({ error: '"distance_to_venue_km" must be a number of kilometres.' }).min(0).optional(),
  })
  .superRefine((place, ctx) => {
    if (place.price_eur_per_night.max < place.price_eur_per_night.min) {
      ctx.addIssue({ code: 'custom', path: ['price_eur_per_night', 'max'], message: 'The maximum price must not be below the minimum.' });
    }
  });

/* ---------- content/cyprus/<id>.md: practical resources ---------- */

export const cyprusResourceSchema = strictObject({
  title: text('title', 100),
  summary: text('summary'),
  /** Lower numbers come first on the Cyprus page. */
  order: z.number({ error: '"order" must be a number, e.g. 10.' }).int(),
  links: z.array(link).max(10, { error: 'A page can have at most 10 links.' }).default([]),
});

/* ---------- content/photos/<id>.yaml: one photo per file ---------- */

export const photoSchema = strictObject({
  /** A photo from unsplash.com: the part of its image address after "images.unsplash.com/". Used by scripts/fetch-photos.mjs. */
  unsplash_id: z
    .string({ error: '"unsplash_id" must be text like "photo-1701121685501-03d44cca164c".' })
    .regex(/^photo-[\w-]+$/, { error: '"unsplash_id" must look like "photo-1701121685501-03d44cca164c".' })
    .optional(),
  /** Or one of your own photos: the file name of a picture in content/photos/originals/. */
  source_file: z
    .string({ error: '"source_file" must be the name of a picture file, like "harbour.jpg".' })
    .regex(/^[\w][\w .()-]*\.(jpe?g|png|webp)$/i, {
      error: '"source_file" must be the name of a .jpg, .png or .webp file in content/photos/originals/ (no folders).',
    })
    .optional(),
  /** What the photo shows, for people who cannot see it. Not a title. */
  alt: text('alt', 250),
  /** Short line printed under the photo, e.g. "Sunset near Paphos". */
  caption: text('caption', 100),
  /** Who took it. Required for Unsplash photos, optional for your own. */
  credit_name: text('credit_name', 100).optional(),
  credit_url: url('credit_url').optional(),
  /** Shape the photo is cropped to, as width:height. */
  aspect: z.enum(['3:2', '4:3', '16:9'], { error: '"aspect" must be one of: 3:2, 4:3, 16:9.' }),
  /** Which part of the photo stays in view when it is cropped, as "x% y%". Left to right, top to bottom. */
  focus: z
    .string()
    .regex(/^\d{1,3}% \d{1,3}%$/, { error: '"focus" must look like "50% 50%".' })
    .default('50% 50%'),
  /** The page this photo decorates, e.g. "/activities". Leave out if it is not used on a page. */
  page: z.string().regex(/^\/[a-z-]*$/, { error: '"page" must start with / and use lowercase letters, e.g. "/activities".' }).optional(),
}).superRefine((photo, ctx) => {
  if (!photo.unsplash_id === !photo.source_file) {
    ctx.addIssue({
      code: 'custom',
      path: ['unsplash_id'],
      message: 'Give either "unsplash_id" (a photo from Unsplash) or "source_file" (your own picture), not both and not neither.',
    });
  }
  if (!photo.credit_name !== !photo.credit_url) {
    ctx.addIssue({ code: 'custom', path: ['credit_name'], message: '"credit_name" and "credit_url" go together: give both or neither.' });
  }
  if (photo.unsplash_id && !photo.credit_name) {
    ctx.addIssue({ code: 'custom', path: ['credit_name'], message: 'Photos from Unsplash need "credit_name" and "credit_url" (the photographer and the photo\'s page).' });
  }
});

export type EventFacts = z.infer<typeof eventSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type Activity = z.infer<typeof activitySchema>;

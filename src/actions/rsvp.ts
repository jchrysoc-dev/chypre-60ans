import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { firstName, joinNames } from '../lib/signups';

const optionalDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.iso.date({ error: 'Dates must look like 2027-05-26.' }).nullable());

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `Please shorten the ${label} (${max} letters at most).` })
    .transform((value) => value || null);

/** One person's reply, read from fields named "<field>-<person id>". */
const reply = z
  .object({
    attending: z.enum(['yes', 'no', 'maybe']),
    arrival_date: optionalDate,
    departure_date: optionalDate,
    flight_in: optionalText(100, 'arrival flight'),
    flight_out: optionalText(100, 'departure flight'),
    dietary: optionalText(500, 'dietary needs'),
    dietary_consent: z.boolean(),
  })
  .refine((r) => !r.arrival_date || !r.departure_date || r.departure_date >= r.arrival_date, {
    error: 'The departure date must be on or after the arrival date.',
  })
  .refine((r) => !r.dietary || r.dietary_consent, {
    error: 'To save dietary needs, please tick the box that allows us to keep them.',
  });

export const rsvp = {
  /** Saves the replies of everyone in the visitor's household. People left unanswered are skipped. */
  save: defineAction({
    accept: 'form',
    handler: async (form: FormData, context) => {
      const visitor = context.locals.person;
      if (!visitor) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in again.' });
      const db = context.locals.supabase;

      const { data: members = [] } = await db.from('people').select('id, full_name').eq('household_id', visitor.household_id);
      const ids = (members ?? []).map((m) => m.id);
      const { data: before = [] } = await db
        .from('rsvps')
        .select('person_id, attending, dietary_consent_at')
        .in('person_id', ids);
      const previous = new Map((before ?? []).map((r) => [r.person_id, r]));

      const rows = [];
      for (const member of members ?? []) {
        const field = (name: string) => form.get(`${name}-${member.id}`);
        if (!field('attending')) continue;
        const parsed = reply.safeParse({
          attending: field('attending'),
          arrival_date: field('arrival_date') ?? '',
          departure_date: field('departure_date') ?? '',
          flight_in: field('flight_in') ?? '',
          flight_out: field('flight_out') ?? '',
          dietary: field('dietary') ?? '',
          dietary_consent: field('dietary_consent') === 'on',
        });
        if (!parsed.success) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `${member.full_name}: ${parsed.error.issues.map((i) => i.message).join(' ')}`,
          });
        }
        const { dietary_consent, ...answer } = parsed.data;
        rows.push({
          person_id: member.id,
          ...answer,
          // Keep the original moment of consent; forget it when the dietary note is removed.
          dietary_consent_at: answer.dietary ? (previous.get(member.id)?.dietary_consent_at ?? new Date().toISOString()) : null,
        });
      }
      if (rows.length === 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Please answer for at least one person.' });

      // People changing to "no" leave their activities (the database does this). Say so.
      const leaving = rows.filter((r) => r.attending === 'no' && previous.get(r.person_id)?.attending !== 'no').map((r) => r.person_id);
      const { data: upcoming } = leaving.length
        ? await db.from('activities').select('id').gt('starts_at', new Date().toISOString())
        : { data: [] };
      const { data: theirSignups } = leaving.length
        ? await db
            .from('activity_signups')
            .select('person_id')
            .in('person_id', leaving)
            .in('activity_id', (upcoming ?? []).map((a) => a.id))
        : { data: [] };

      const { error } = await db.from('rsvps').upsert(rows);
      if (error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: error.code === '23514' ? 'Please check the dates and details, something looks wrong.' : 'Your reply could not be saved. Please try again.',
        });
      }

      const nameOf = (id: string) => firstName((members ?? []).find((m) => m.id === id)?.full_name ?? '');
      const left = [...new Set((theirSignups ?? []).map((s) => s.person_id))];
      return {
        message: 'Thank you, your reply is saved.',
        leftActivities: left.length ? `${joinNames(left.map(nameOf))} ${left.length === 1 ? 'was' : 'were'} also taken off the activities they had signed up for.` : undefined,
      };
    },
  }),
};

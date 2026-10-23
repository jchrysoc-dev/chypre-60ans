import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import * as guestList from '../lib/guest-list';
import { createSecretClient } from '../lib/supabase';

/** Organisers only. The middleware already blocks others; this is a second lock on the door. */
function organiser(context: ActionAPIContext) {
  if (context.locals.person?.role !== 'admin') {
    throw new ActionError({ code: 'FORBIDDEN', message: 'Only the organisers can change the guest list.' });
  }
  return { db: context.locals.supabase, secret: createSecretClient() };
}

async function run<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof guestList.GuestListError) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
    throw error;
  }
}

const name = z
  .string()
  .trim()
  .min(1, { error: 'Please type a name.' })
  .max(100, { error: 'Please use a shorter name (100 letters at most).' });

/** Blank means "no email" (e.g. a child who won't log in). */
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value || null)
  .pipe(z.email({ error: 'This email address looks incomplete, for example anna@example.com.' }).nullable());

const id = z.uuid();

/** A checkbox that must be ticked to confirm a removal. */
const ticked = z.boolean().refine((value) => value, { error: 'Tick the box to confirm.' });

const personFields = {
  full_name: name,
  email: optionalEmail,
  is_child: z.boolean(),
};

export const admin = {
  /** A household with up to six people; blank rows are ignored. Rows arrive as parallel lists. */
  addHousehold: defineAction({
    accept: 'form',
    input: z
      .object({
        label: name,
        full_name: z.array(z.string()),
        email: z.array(z.string()),
        kind: z.array(z.enum(['adult', 'child'])),
      })
      .transform(({ label, full_name, email, kind }) => ({
        label,
        people: full_name
          .map((n, i) => ({ full_name: n.trim(), email: (email[i] ?? '').trim(), is_child: kind[i] === 'child' }))
          .filter((p) => p.full_name || p.email),
      }))
      .pipe(
        z.object({
          label: name,
          people: z.array(z.object(personFields)).min(1, { error: 'Please add at least one person.' }),
        }),
      ),
    handler: async ({ label, people }, context) => {
      const { db, secret } = organiser(context);
      await run(() => guestList.addHousehold(db, secret, label, people));
      return { message: `${label} was added to the guest list.` };
    },
  }),

  addPerson: defineAction({
    accept: 'form',
    input: z.object({ household_id: id, ...personFields }),
    handler: async ({ household_id, ...person }, context) => {
      const { db, secret } = organiser(context);
      await run(() => guestList.addPerson(db, secret, household_id, person));
      return { message: `${person.full_name} was added.` };
    },
  }),

  updatePerson: defineAction({
    accept: 'form',
    input: z.object({ person_id: id, ...personFields }),
    handler: async ({ person_id, ...person }, context) => {
      const { db, secret } = organiser(context);
      await run(() => guestList.updatePerson(db, secret, person_id, person));
      return { message: `${person.full_name} was updated.` };
    },
  }),

  removePerson: defineAction({
    accept: 'form',
    input: z.object({ person_id: id, full_name: z.string(), confirm: ticked }),
    handler: async ({ person_id, full_name }, context) => {
      const { db, secret } = organiser(context);
      await run(() => guestList.removePerson(db, secret, person_id));
      return { message: `${full_name} was removed from the guest list.` };
    },
  }),

  removeHousehold: defineAction({
    accept: 'form',
    input: z.object({ household_id: id, label: z.string(), confirm: ticked }),
    handler: async ({ household_id, label }, context) => {
      const { db, secret } = organiser(context);
      await run(() => guestList.removeHousehold(db, secret, household_id));
      return { message: `${label} was removed from the guest list.` };
    },
  }),
};

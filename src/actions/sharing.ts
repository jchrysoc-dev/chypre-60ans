import { ActionError, defineAction } from 'astro:actions';
import { getCollection } from 'astro:content';
import { SHARING_FIELDS, type SharingField } from '../lib/database.types';
import { FIELD_LABEL, normalisePhone, PhoneError } from '../lib/sharing';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function tooLong(value: string, label: string) {
  if (value.length > 100) throw new ActionError({ code: 'BAD_REQUEST', message: `Please shorten ${label} (100 letters at most).` });
  return value || null;
}

/** Saves through public.save_my_sharing, which runs as the visitor: the database decides what is allowed. */
async function save(
  db: App.Locals['supabase'],
  details: { phone: string | null; whatsapp: boolean; city: string | null; stayingAt: string | null; stayingOther: string | null },
  fields: SharingField[],
) {
  const { error } = await db.rpc('save_my_sharing', {
    p_phone: details.phone,
    p_phone_whatsapp: details.whatsapp,
    p_city: details.city,
    p_staying_at: details.stayingAt,
    p_staying_other: details.stayingOther,
    p_fields: fields,
  });
  if (error) {
    // The code only: the values are personal data and never go to the logs.
    console.error(`[sharing] save refused: code=${error.code ?? '-'}`);
    throw new ActionError({
      code: 'BAD_REQUEST',
      message:
        error.code === '42501' && fields.includes('children')
          ? 'There are no children in your household to show.'
          : 'Your choices could not be saved. Please check them and try again.',
    });
  }
}

export const sharing = {
  /** The visitor's own details and switches, from the form on /me. Unticked switches are switched off. */
  save: defineAction({
    accept: 'form',
    handler: async (form: FormData, context) => {
      if (!context.locals.person) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in again.' });

      const fields = SHARING_FIELDS.filter((field) => form.get(`share-${field}`) === 'on');
      let phone: string | null;
      try {
        phone = normalisePhone(text(form, 'phone'));
      } catch (error) {
        if (error instanceof PhoneError) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
        throw error;
      }
      const city = tooLong(text(form, 'city'), 'where you live');
      const places = new Set((await getCollection('accommodation')).map((p) => p.id));
      const choice = text(form, 'staying_at');
      const stayingAt = choice === 'other' || places.has(choice) ? choice : null;
      const stayingOther = stayingAt === 'other' ? tooLong(text(form, 'staying_other'), 'where you are staying') : null;
      if (stayingAt === 'other' && !stayingOther) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Please type where you are staying, or choose one of the places in the list.' });
      }

      // A switch with nothing behind it would show nothing: say so instead of saving it silently.
      const missing = (
        [
          ['phone', phone],
          ['city', city],
          ['staying_at', stayingAt],
        ] as const
      ).filter(([field, value]) => fields.includes(field) && !value);
      if (missing.length) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `You switched on “${missing.map(([field]) => FIELD_LABEL[field]).join('” and “')}” but left it empty. Please fill it in, or switch it off.`,
        });
      }

      await save(context.locals.supabase, { phone, whatsapp: Boolean(phone) && form.get('phone_whatsapp') === 'on', city, stayingAt, stayingOther }, fields);
      return {
        message: fields.includes('listed')
          ? 'Saved. Other guests see exactly what you switched on, starting now.'
          : 'Saved. You are not on the Participants page, and nothing is shared.',
      };
    },
  }),

  /** Empties every detail and switches everything off. The visitor still shows as "chose not to share" to the organisers. */
  clear: defineAction({
    accept: 'form',
    handler: async (_form: FormData, context) => {
      if (!context.locals.person) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in again.' });
      await save(context.locals.supabase, { phone: null, whatsapp: false, city: null, stayingAt: null, stayingOther: null }, []);
      return { message: 'Done. Everything you had shared is deleted, and you are no longer on the Participants page.' };
    },
  }),
};

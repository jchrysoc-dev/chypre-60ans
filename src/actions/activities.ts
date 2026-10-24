import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { ensureActivitiesSynced, explain, getActivities, loadHouseholdView } from '../lib/activities';
import { blockedReason, closedReason, firstName, joinNames, planChanges } from '../lib/signups';

const CLOSED = {
  cancelled: 'This activity has been cancelled.',
  started: 'This activity has already started, so sign-ups are closed.',
  removed: 'This activity is no longer on the programme.',
};

export const activities = {
  /**
   * Saves who in the household goes to one activity: ticked people are signed up together
   * (as one group on the waiting list if they don't all fit), unticked people are cancelled.
   * Outcomes come back as data, not errors, so the page can show them next to the activity.
   */
  save: defineAction({
    accept: 'form',
    input: z.object({
      activity_id: z.string().regex(/^[a-z0-9-]+$/),
      person_id: z.array(z.uuid()).default([]),
    }),
    handler: async ({ activity_id, person_id }, context) => {
      const visitor = context.locals.person;
      if (!visitor) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please log in again.' });
      const db = context.locals.supabase;
      const reply = (ok: boolean, message: string) => ({ activityId: activity_id, ok, message });

      await ensureActivitiesSynced();
      const activity = (await getActivities()).find((a) => a.id === activity_id);
      if (!activity) return reply(false, CLOSED.removed);
      const closed = closedReason({ cancelled: activity.data.status === 'cancelled', start: activity.data.start });
      if (closed) return reply(false, CLOSED[closed]);

      const { members, signups } = await loadHouseholdView(db, visitor.household_id);
      const current = signups.get(activity_id) ?? new Map();
      // Someone already signed up can always be unticked, even if they couldn't be ticked now.
      const editable = new Set(
        members.filter((m) => current.has(m.id) || !blockedReason(m, activity.data)).map((m) => m.id),
      );
      const { add, remove } = planChanges(current, new Set(person_id), editable);
      if (add.length === 0 && remove.length === 0) {
        return { ...reply(true, 'Nothing changed: the ticks are the same as before.'), changed: false };
      }

      const nameOf = (id: string) => firstName(members.find((m) => m.id === id)?.full_name ?? '');
      const sentences: string[] = [];

      if (remove.length > 0) {
        const { error } = await db
          .from('activity_signups')
          .delete()
          .eq('activity_id', activity_id)
          .in('person_id', remove);
        if (error) return reply(false, explain(error).message);
        sentences.push(`${joinNames(remove.map(nameOf))} ${remove.length === 1 ? 'is' : 'are'} no longer signed up.`);
      }

      if (add.length > 0) {
        const { data: status, error } = await db.rpc('sign_up', { p_activity_id: activity_id, p_person_ids: add });
        if (error) return reply(false, [...sentences, explain(error).message].join(' '));
        const names = joinNames(add.map(nameOf));
        const plural = add.length > 1;
        sentences.push(
          status === 'waitlisted'
            ? `It's full, so ${names} ${plural ? 'are' : 'is'} on the waiting list. ${plural ? 'They get places' : 'They get a place'} automatically if one frees up.`
            : `${names} ${plural ? 'are' : 'is'} going.`,
        );
      }
      return reply(true, sentences.join(' '));
    },
  }),
};

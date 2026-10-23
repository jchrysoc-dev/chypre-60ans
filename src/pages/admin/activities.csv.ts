/** All activity sign-ups as a spreadsheet. Organisers only: the middleware guards /admin/*. */
import type { APIRoute } from 'astro';
import { loadAdminActivities } from '../../lib/activities';
import { csvResponse, toCsv } from '../../lib/csv';
import { cyprusDateTime } from '../../lib/format';

export const GET: APIRoute = async ({ locals }) => {
  const activities = await loadAdminActivities(locals.supabase);
  const rows = activities.flatMap((a) =>
    [...a.going, ...a.waiting].map((s) => [
      a.id,
      a.title,
      cyprusDateTime(a.start),
      a.cancelled,
      a.inContent,
      s.fullName,
      s.household,
      s.isChild,
      s.status === 'confirmed' ? 'going' : 'waiting',
      s.peopleAhead ?? '',
      cyprusDateTime(s.signedUpAt),
      cyprusDateTime(s.promotedAt),
    ]),
  );
  const header = [
    'activity_id',
    'activity',
    'start_cyprus_time',
    'cancelled',
    'on_website',
    'name',
    'household',
    'child',
    'status',
    'people_ahead',
    'signed_up_at_cyprus_time',
    'promoted_at_cyprus_time',
  ];
  return csvResponse('activity-signups', toCsv(header, rows));
};

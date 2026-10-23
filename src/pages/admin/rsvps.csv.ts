/** Everyone on the guest list with their reply, as a spreadsheet. Organisers only: the middleware guards /admin/*. */
import type { APIRoute } from 'astro';
import { csvResponse, toCsv } from '../../lib/csv';
import { cyprusDateTime } from '../../lib/format';
import { loadReplies } from '../../lib/replies';

export const GET: APIRoute = async ({ locals }) => {
  const replies = await loadReplies(locals.supabase);
  const rows = replies.map(({ fullName, household, isChild, reply }) => [
    fullName,
    household,
    isChild,
    reply?.attending ?? 'not replied',
    reply?.arrival_date,
    reply?.departure_date,
    reply?.flight_in,
    reply?.flight_out,
    reply?.dietary,
    cyprusDateTime(reply?.updated_at),
  ]);
  const header = ['name', 'household', 'child', 'reply', 'arriving', 'leaving', 'flight_in', 'flight_out', 'dietary', 'replied_at_cyprus_time'];
  return csvResponse('replies', toCsv(header, rows));
};

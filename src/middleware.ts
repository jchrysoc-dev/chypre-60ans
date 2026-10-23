import { defineMiddleware } from 'astro:middleware';
import { createVisitorClient } from './lib/supabase';

/** Pages anyone can open without logging in. Everything else needs a login. */
const PUBLIC_PATHS = new Set(['/login', '/auth/confirm', '/privacy']);
const isPublic = (path: string) => PUBLIC_PATHS.has(path) || path === '/robots.txt' || path.startsWith('/_astro/');
const isAdminArea = (path: string) => path === '/admin' || path.startsWith('/admin/') || path.startsWith('/_actions/admin.');

const PRIVATE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  // Pages contain personal data: never store them in shared caches.
  'Cache-Control': 'private, no-store',
  // Keep login tokens in URLs from leaking to other sites through the Referer header.
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/$/, '') || '/';
  const supabase = createVisitorClient(context);
  context.locals.supabase = supabase;

  const withHeaders = (response: Response) => {
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
    return response;
  };

  // Verifies the session (and refreshes it if needed) on every request.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (userId) {
    const { data: person } = await supabase
      .from('people')
      .select('id, household_id, full_name, role')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (person) {
      context.locals.person = person;
    } else if (!isPublic(path)) {
      // A valid login that is no longer on the guest list (e.g. removed by Mum).
      await supabase.auth.signOut();
      return withHeaders(context.redirect('/login?reason=not-on-list'));
    }
  }

  if (!isPublic(path) && !context.locals.person) {
    return withHeaders(context.redirect('/login'));
  }
  if (isAdminArea(path) && context.locals.person?.role !== 'admin') {
    return withHeaders(await context.rewrite('/404'));
  }

  return withHeaders(await next());
});

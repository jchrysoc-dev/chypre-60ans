import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL } from 'astro:env/server';
import type { Database } from './database.types';

/**
 * Client acting as the visitor: reads their session from cookies, and Row-Level Security
 * decides what they can see. Use this for everything except managing logins.
 */
export function createVisitorClient({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' })),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) cookies.set(name, value, { ...options, httpOnly: true });
      },
    },
  });
}

/**
 * Client with the secret key: bypasses Row-Level Security. Only for creating, changing and
 * deleting logins (auth users) when an organiser edits the guest list. Never for page data.
 */
export function createSecretClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type VisitorClient = ReturnType<typeof createVisitorClient>;

import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';

export const auth = {
  /**
   * Sends a login link by email. Only people already on the guest list have a login
   * (sign-up is switched off in Supabase), so unknown emails simply get no email.
   * The reply is the same either way, so the form never reveals who is invited.
   */
  requestLink: defineAction({
    accept: 'form',
    input: z.object({
      email: z.email({ error: 'Please type your full email address, for example anna@example.com.' }).trim().toLowerCase(),
    }),
    handler: async ({ email }, context) => {
      const { error } = await context.locals.supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: new URL('/auth/confirm', context.url).href },
      });
      if (error?.status === 429) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many login emails were requested. Please wait a few minutes, then try again.',
        });
      }
      // Unknown emails come back as 4xx "signups not allowed": treat them like success.
      // Anything else (5xx, or status 0 when Supabase can't be reached) is a real failure.
      const status = error?.status ?? 0;
      if (error && import.meta.env.DEV) {
        // Development only, and never the email address: helps diagnose SMTP/setup problems.
        console.warn(`[login] Supabase refused: status=${status} code=${error.code ?? '-'} message="${error.message}"`);
      }
      if (error && !(status >= 400 && status < 500)) {
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The login email could not be sent just now. Please try again in a few minutes.',
        });
      }
      return { sent: true };
    },
  }),

  /** Exchanges the one-time token from the email link for a session. */
  confirmLink: defineAction({
    accept: 'form',
    input: z.object({ token_hash: z.string().min(1) }),
    handler: async ({ token_hash }, context) => {
      const { data, error } = await context.locals.supabase.auth.verifyOtp({ token_hash, type: 'email' });
      if (error || !data.user) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'This login link has expired or was already used. Please ask for a new one below.',
        });
      }
      return { loggedIn: true };
    },
  }),

  logout: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      await context.locals.supabase.auth.signOut();
      return { loggedOut: true };
    },
  }),
};

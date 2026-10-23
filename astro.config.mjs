// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// Every page sits behind login, so everything is rendered on the server per request
// (pre-rendered pages would be served by the CDN without passing the login check).
export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  adapter: vercel(),
  vite: { plugins: [tailwindcss()] },
  env: {
    schema: {
      // Documented in .env.example. All server-only: nothing is exposed to the browser.
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', url: true }),
      SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});

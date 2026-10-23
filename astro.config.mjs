// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// M1: static output. M2 switches to server output on Vercel (every page sits behind login).
export default defineConfig({
  vite: { plugins: [tailwindcss()] },
});

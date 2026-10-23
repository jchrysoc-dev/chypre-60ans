/// <reference types="astro/client" />

/** ISO time of the build (astro.config.mjs). */
declare const __BUILT_AT__: string;

declare namespace App {
  interface Locals {
    supabase: import('./lib/supabase').VisitorClient;
    /** The logged-in guest. Absent only on public pages (login, privacy). */
    person?: Pick<import('./lib/database.types').Person, 'id' | 'household_id' | 'full_name' | 'role'>;
  }
}

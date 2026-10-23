/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    supabase: import('./lib/supabase').VisitorClient;
    /** The logged-in guest. Absent only on public pages (login, privacy). */
    person?: Pick<import('./lib/database.types').Person, 'id' | 'household_id' | 'full_name' | 'role'>;
  }
}

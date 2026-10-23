import { readdirSync, readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf-8');

/** Fake user ids from supabase/seed.sql. */
export const users = {
  ada: '00000000-0000-4000-8000-0000000000a1', // organiser
  ben: '00000000-0000-4000-8000-0000000000b1', // Example household
  bea: '00000000-0000-4000-8000-0000000000b2', // Example household
  carl: '00000000-0000-4000-8000-0000000000c1', // Sample household
  dora: '00000000-0000-4000-8000-0000000000d1', // Demo household
  stranger: '00000000-0000-4000-8000-0000000000ff', // valid login, not on the guest list
};
export const people = {
  ada: '00000000-0000-4000-8000-0000000000aa',
  ben: '00000000-0000-4000-8000-0000000000ba',
  bea: '00000000-0000-4000-8000-0000000000bb',
  bobby: '00000000-0000-4000-8000-0000000000bc',
  carl: '00000000-0000-4000-8000-0000000000ca',
  dora: '00000000-0000-4000-8000-0000000000da',
};
export const households = {
  organisers: '00000000-0000-4000-8000-00000000a000',
  example: '00000000-0000-4000-8000-00000000b000',
  sample: '00000000-0000-4000-8000-00000000c000',
  demo: '00000000-0000-4000-8000-00000000d000',
};

/** A fresh database with every migration and the fake seed applied. */
export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(read('tests/db/supabase-stubs.sql'));
  const migrations = readdirSync(new URL('supabase/migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) await db.exec(read(`supabase/migrations/${file}`));
  await db.exec(read('supabase/seed.sql'));
  return db;
}

type Role = 'anon' | 'authenticated' | 'service_role';

/**
 * Run queries the way a request from the website would: as a database role, with a user id
 * in the JWT claims. Everything is rolled back afterwards so tests don't affect each other.
 */
export async function as<T>(db: PGlite, role: Role, userId: string | null, fn: (tx: Transaction) => Promise<T>) {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId } : {})]);
      await tx.exec(`set local role ${role}`);
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result!;
}
class Rollback extends Error {}

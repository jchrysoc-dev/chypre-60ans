/**
 * Row-Level Security: who can see and change what. Runs the real migrations on an
 * in-process Postgres (PGlite) with fake data from supabase/seed.sql.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createTestDatabase, households, people, users } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

const names = (rows: { full_name: string }[]) => rows.map((r) => r.full_name).sort();

describe('not logged in (anon)', () => {
  it.each(['households', 'people', 'rsvps'])('cannot read %s', async (table) => {
    await expect(as(db, 'anon', null, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('a logged-in user who is not on the guest list', () => {
  it('sees nothing at all', async () => {
    const counts = await as(db, 'authenticated', users.stranger, async (tx) => ({
      households: (await tx.query('select * from public.households')).rows.length,
      people: (await tx.query('select * from public.people')).rows.length,
      rsvps: (await tx.query('select * from public.rsvps')).rows.length,
    }));
    expect(counts).toEqual({ households: 0, people: 0, rsvps: 0 });
  });
});

describe('a guest', () => {
  it('sees only the people in their own household', async () => {
    const { rows } = await as(db, 'authenticated', users.ben, (tx) =>
      tx.query<{ full_name: string }>('select full_name from public.people'),
    );
    expect(names(rows)).toEqual(['Bea Example', 'Ben Example', 'Bobby Example']);
  });

  it("cannot read another household's RSVP", async () => {
    const { rows } = await as(db, 'authenticated', users.ben, (tx) =>
      tx.query('select * from public.rsvps where person_id = $1', [people.carl]),
    );
    expect(rows).toEqual([]);
  });

  it("cannot write another household's RSVP", async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(`insert into public.rsvps (person_id, attending) values ($1, 'no')`, [people.carl]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('can reply for another member of their household, including a child without email', async () => {
    const { rows } = await as(db, 'authenticated', users.bea, async (tx) => {
      await tx.query(`insert into public.rsvps (person_id, attending) values ($1, 'yes')`, [people.bobby]);
      return tx.query('select person_id from public.rsvps order by person_id');
    });
    expect(rows).toEqual([{ person_id: people.ben }, { person_id: people.bobby }]);
  });

  it("can correct a household member's name", async () => {
    const { rows } = await as(db, 'authenticated', users.bea, (tx) =>
      tx.query(`update public.people set full_name = 'Bobby E.' where id = $1 returning full_name`, [people.bobby]),
    );
    expect(rows).toEqual([{ full_name: 'Bobby E.' }]);
  });

  it.each([
    ['make themselves an organiser', `update public.people set role = 'admin' where id = '${people.ben}'`, /Organiser status/],
    ['change their email', `update public.people set email = 'x@example.com' where id = '${people.ben}'`, /Only the organisers/],
    ['move to another household', `update public.people set household_id = '${households.sample}' where id = '${people.ben}'`, /Only the organisers/],
    ['relink their login', `update public.people set auth_user_id = null where id = '${people.ben}'`, /Logins are linked by the server/],
  ])('cannot %s', async (_label, sql, message) => {
    await expect(as(db, 'authenticated', users.ben, (tx) => tx.query(sql))).rejects.toThrow(message);
  });

  it('cannot add or remove people', async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(`insert into public.people (household_id, full_name) values ($1, 'Extra')`, [households.example]),
      ),
    ).rejects.toThrow(/row-level security/);
    const { affectedRows } = await as(db, 'authenticated', users.ben, (tx) =>
      tx.query('delete from public.people where id = $1', [people.bobby]),
    );
    expect(affectedRows).toBe(0);
  });

  it('cannot see or rename households other than their own', async () => {
    const result = await as(db, 'authenticated', users.ben, async (tx) => ({
      visible: (await tx.query('select id from public.households')).rows,
      renamed: (await tx.query(`update public.households set label = 'x'`)).affectedRows,
    }));
    expect(result).toEqual({ visible: [{ id: households.example }], renamed: 0 });
  });
});

describe('an organiser', () => {
  it('sees everyone and every RSVP', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => ({
      people: (await tx.query('select id from public.people')).rows.length,
      rsvps: (await tx.query('select person_id from public.rsvps')).rows.length,
    }));
    expect(result).toEqual({ people: 6, rsvps: 3 });
  });

  it('can add a household with people, change an email and remove a person', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(`insert into public.households (label) values ('New family') returning id`);
      await tx.query(`insert into public.people (household_id, full_name, email) values ($1, 'New Person', 'new@example.com')`, [rows[0].id]);
      await tx.query(`update public.people set email = 'carl.new@example.com' where id = $1`, [people.carl]);
      await tx.query('delete from public.people where id = $1', [people.bobby]);
      return (await tx.query('select count(*)::int as n from public.people')).rows[0];
    });
    expect(result).toEqual({ n: 6 });
  });

  it('cannot create or promote organisers from the website', async () => {
    await expect(
      as(db, 'authenticated', users.ada, (tx) =>
        tx.query(`insert into public.people (household_id, full_name, email, role) values ($1, 'X', 'x@example.com', 'admin')`, [households.sample]),
      ),
    ).rejects.toThrow(/Organisers can only be added/);
    await expect(
      as(db, 'authenticated', users.ada, (tx) => tx.query(`update public.people set role = 'admin' where id = $1`, [people.carl])),
    ).rejects.toThrow(/Organiser status/);
  });
});

describe('the server (secret key)', () => {
  it('can unlink a login and grant organiser status', async () => {
    const { rows } = await as(db, 'service_role', null, (tx) =>
      tx.query(`update public.people set role = 'admin', auth_user_id = null where id = $1 returning role, auth_user_id`, [
        people.carl,
      ]),
    );
    expect(rows).toEqual([{ role: 'admin', auth_user_id: null }]);
  });
});

describe('data rules', () => {
  it.each([
    ['an uppercase email', `insert into public.people (household_id, full_name, email) values ('${households.sample}', 'X', 'Bad@Example.com')`],
    ['an email without @', `insert into public.people (household_id, full_name, email) values ('${households.sample}', 'X', 'nope')`],
    ['a blank name', `insert into public.people (household_id, full_name) values ('${households.sample}', '   ')`],
    ['departure before arrival', `insert into public.rsvps (person_id, attending, arrival_date, departure_date) values ('${people.bea}', 'yes', '2027-05-30', '2027-05-20')`],
    ['dietary needs without consent', `insert into public.rsvps (person_id, attending, dietary) values ('${people.bea}', 'yes', 'Nut allergy')`],
    ['an unknown reply', `insert into public.rsvps (person_id, attending) values ('${people.bea}', 'perhaps')`],
  ])('rejects %s', async (_label, sql) => {
    await expect(as(db, 'service_role', null, (tx) => tx.query(sql))).rejects.toThrow(/violates check constraint/);
  });
});

describe('keep-alive', () => {
  it('lets anyone call ping(), which touches no data', async () => {
    const { rows } = await as(db, 'anon', null, (tx) => tx.query('select public.ping() as result'));
    expect(rows).toEqual([{ result: 'ok' }]);
  });
});

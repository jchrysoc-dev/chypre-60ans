/**
 * The participants directory: guests only ever read what its owner chose to share,
 * enforced by the database. Runs the real migrations on PGlite with the fake data from
 * supabase/seed.sql: Ben, Bea and child Bobby are one household, Carl and Dora are alone.
 */
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createTestDatabase, people, users } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

/** Switch the logged-in user inside one transaction, to play out a scenario between guests. */
const actAs = (tx: Transaction, userId: string) =>
  tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);

type Details = { phone?: string; whatsapp?: boolean; city?: string; stayingAt?: string; stayingOther?: string };

async function save(tx: Transaction, fields: string[], d: Details = {}) {
  await tx.query('select public.save_my_sharing($1, $2, $3, $4, $5, $6::text[])', [
    d.phone ?? null,
    d.whatsapp ?? false,
    d.city ?? null,
    d.stayingAt ?? null,
    d.stayingOther ?? null,
    fields,
  ]);
}

type Entry = { name: string; is_child: boolean; email: string | null; phone: string | null; city: string | null };
const directory = async (tx: Transaction) =>
  (await tx.query<Entry & Record<string, unknown>>('select * from public.participants() order by name')).rows;

const carlDetails: Details = { phone: '+35799123456', whatsapp: true, city: 'Nicosia', stayingAt: 'seaside-hotel' };
const everythingButEmail = ['listed', 'phone', 'city', 'staying_at', 'dates', 'activities'];

describe('who can call the directory', () => {
  it('not logged in: refused', async () => {
    await expect(as(db, 'anon', null, (tx) => tx.query('select * from public.participants()'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, 'anon', null, (tx) => tx.query('select * from public.profiles'))).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', null, (tx) => tx.query('select * from public.sharing_consents'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('a login that is not on the guest list sees nobody and cannot share', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed']);
      await actAs(tx, users.stranger);
      return directory(tx);
    });
    expect(rows).toEqual([]);
    await expect(as(db, 'authenticated', users.stranger, (tx) => save(tx, ['listed']))).rejects.toThrow(/guest list/);
  });
});

describe('nothing is shared by default', () => {
  it('nobody is listed until they switch it on', async () => {
    expect(await as(db, 'authenticated', users.ben, directory)).toEqual([]);
  });

  it('details saved without any switch stay private', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, [], carlDetails);
      await actAs(tx, users.dora);
      return directory(tx);
    });
    expect(rows).toEqual([]);
  });

  it('listed alone shows the name and nothing else', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed'], carlDetails);
      await actAs(tx, users.dora);
      return directory(tx);
    });
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Carl Sample', email: null, phone: null, phone_whatsapp: null, city: null,
        staying_at: null, arrival_date: null, activity_ids: null,
      }),
    ]);
  });

  it('fields switched on without being listed show nothing', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['email', 'phone', 'city'], carlDetails);
      await actAs(tx, users.dora);
      return directory(tx);
    });
    expect(rows).toEqual([]);
  });
});

describe('guest A hides their email, guest B must not get it', () => {
  it('B gets null for the email from the directory, and the shared fields', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, everythingButEmail, carlDetails);
      await actAs(tx, users.dora);
      return directory(tx);
    });
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Carl Sample', email: null, phone: '+35799123456', phone_whatsapp: true,
        city: 'Nicosia', staying_at: 'seaside-hotel', activity_ids: [],
      }),
    ]);
  });

  it("B cannot read A's row from any table directly", async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, everythingButEmail, carlDetails);
      await actAs(tx, users.dora);
      const count = async (sql: string) => (await tx.query(sql, [people.carl])).rows.length;
      return {
        people: await count('select * from public.people where id = $1'),
        profiles: await count('select * from public.profiles where person_id = $1'),
        consents: await count('select * from public.sharing_consents where person_id = $1'),
        rsvps: await count('select * from public.rsvps where person_id = $1'),
      };
    });
    expect(result).toEqual({ people: 0, profiles: 0, consents: 0, rsvps: 0 });
  });

  it("not even another adult in A's own household reads A's profile", async () => {
    const rows = await as(db, 'authenticated', users.ben, async (tx) => {
      await save(tx, ['listed'], { phone: '+33612345678' });
      await actAs(tx, users.bea);
      return (await tx.query('select * from public.profiles where person_id = $1', [people.ben])).rows;
    });
    expect(rows).toEqual([]);
  });
});

describe('changing and withdrawing consent', () => {
  it('switching a field off hides it straight away; switching listed off hides the person', async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed', 'email', 'phone'], carlDetails);
      await actAs(tx, users.dora);
      const before = await directory(tx);
      await actAs(tx, users.carl);
      await save(tx, ['listed', 'phone'], carlDetails);
      await actAs(tx, users.dora);
      const afterEmailOff = await directory(tx);
      await actAs(tx, users.carl);
      await save(tx, ['email', 'phone'], carlDetails);
      await actAs(tx, users.dora);
      return { before, afterEmailOff, afterUnlisted: await directory(tx) };
    });
    expect(result.before[0]).toMatchObject({ email: 'carl.sample@example.com', phone: '+35799123456' });
    expect(result.afterEmailOff[0]).toMatchObject({ email: null, phone: '+35799123456' });
    expect(result.afterUnlisted).toEqual([]);
  });

  it('a field that stays on keeps the time it was first switched on', async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed']);
      // Pretend it was switched on long ago (as the table owner: guests cannot do this).
      await tx.exec('reset role');
      await tx.query(`update public.sharing_consents set granted_at = '2026-01-01T00:00Z'`);
      await tx.exec('set local role authenticated');
      await save(tx, ['listed', 'city'], { city: 'Paphos' });
      const { rows } = await tx.query<{ field: string; old: boolean }>(
        `select field, granted_at < '2026-06-01' as old from public.sharing_consents order by field`,
      );
      return rows;
    });
    expect(result).toEqual([
      { field: 'city', old: false },
      { field: 'listed', old: true },
    ]);
  });

  it('records the first time choices were saved, even with everything off', async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, []);
      return (await tx.query('select choices_saved_at is not null as chose from public.profiles')).rows;
    });
    expect(rows).toEqual([{ chose: true }]);
  });

  it('a guest cannot fake when they saved their choices', async () => {
    await expect(
      as(db, 'authenticated', users.carl, (tx) =>
        tx.query(`insert into public.profiles (person_id, choices_saved_at) values ($1, '2020-01-01')`, [people.carl]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, 'authenticated', users.carl, async (tx) => {
        await save(tx, []);
        await tx.query(`update public.profiles set choices_saved_at = '2020-01-01'`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('saving again keeps the first time choices were saved', async () => {
    const same = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, []);
      const first = (await tx.query<{ t: string }>('select choices_saved_at::text as t from public.profiles')).rows[0].t;
      await tx.exec(`select pg_sleep(0.01)`);
      await save(tx, ['listed'], { city: 'Paphos' });
      const again = (await tx.query<{ t: string }>('select choices_saved_at::text as t from public.profiles')).rows[0].t;
      return first === again;
    });
    expect(same).toBe(true);
  });
});

describe('consent is personal', () => {
  it("a guest cannot switch sharing on for someone else, even in their household", async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(`insert into public.sharing_consents (person_id, field) values ($1, 'email')`, [people.bea]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(`insert into public.profiles (person_id, phone) values ($1, '+33612345678')`, [people.bea]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a guest cannot choose the consent time', async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(`insert into public.sharing_consents (person_id, field, granted_at) values ($1, 'email', '2020-01-01')`, [
          people.ben,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, 'authenticated', users.ben, (tx) => tx.query(`update public.sharing_consents set granted_at = '2020-01-01'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("another guest cannot withdraw someone else's consent", async () => {
    const rows = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed']);
      await actAs(tx, users.dora);
      await tx.query('delete from public.sharing_consents where person_id = $1', [people.carl]);
      return directory(tx);
    });
    expect(rows).toHaveLength(1);
  });

  it('an organiser sees everything and can withdraw, but cannot switch sharing on', async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed'], carlDetails);
      await actAs(tx, users.ada);
      const profile = (await tx.query('select phone, city from public.profiles where person_id = $1', [people.carl])).rows;
      await tx.query(`delete from public.sharing_consents where person_id = $1 and field = 'listed'`, [people.carl]);
      await actAs(tx, users.dora);
      return { profile, afterWithdrawal: await directory(tx) };
    });
    expect(result).toEqual({ profile: [{ phone: '+35799123456', city: 'Nicosia' }], afterWithdrawal: [] });
    await expect(
      as(db, 'authenticated', users.ada, (tx) =>
        tx.query(`insert into public.sharing_consents (person_id, field) values ($1, 'listed')`, [people.carl]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('rejects an unknown field and a malformed phone number', async () => {
    await expect(as(db, 'authenticated', users.carl, (tx) => save(tx, ['listed', 'address']))).rejects.toThrow(/check constraint/);
    await expect(as(db, 'authenticated', users.carl, (tx) => save(tx, [], { phone: '099 123' }))).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe('households and children', () => {
  it('children appear by first name only, when a listed adult shares them', async () => {
    const result = await as(db, 'authenticated', users.ben, async (tx) => {
      await save(tx, ['listed']);
      await actAs(tx, users.carl);
      const without = await directory(tx);
      await actAs(tx, users.ben);
      await save(tx, ['listed', 'children']);
      await actAs(tx, users.carl);
      return { without, with: await directory(tx) };
    });
    expect(result.without.map((r) => r.name)).toEqual(['Ben Example']);
    expect(result.with.map((r) => [r.name, r.is_child])).toEqual([
      ['Ben Example', false],
      ['Bobby', true],
    ]);
  });

  it('a household without children cannot switch on children', async () => {
    await expect(as(db, 'authenticated', users.carl, (tx) => save(tx, ['listed', 'children']))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('a listed person who replied no is not shown', async () => {
    const rows = await as(db, 'authenticated', users.dora, async (tx) => {
      await save(tx, ['listed']);
      await tx.query(`update public.rsvps set attending = 'no' where person_id = $1`, [people.dora]);
      await actAs(tx, users.carl);
      return directory(tx);
    });
    expect(rows).toEqual([]);
  });

  it('shared activities list confirmed places only', async () => {
    const rows = await as(db, 'authenticated', users.dora, async (tx) => {
      await tx.query(`select public.sign_up('fake-unlimited', $1::uuid[])`, [[people.dora]]);
      await save(tx, ['listed', 'activities', 'dates']);
      await actAs(tx, users.carl);
      return directory(tx);
    });
    expect(rows[0]).toMatchObject({ name: 'Dora Demo', activity_ids: ['fake-unlimited'] });
  });
});

describe('closing the directory', () => {
  it('closes on 30 June 2027 at 03:00 in Cyprus', async () => {
    const { rows } = await db.query<{ closes: Date }>('select private.directory_closes_at() as closes');
    expect(rows[0].closes.toISOString()).toBe('2027-06-30T00:00:00.000Z');
  });

  it('close_directory() does nothing before the closing date and cannot be called by guests', async () => {
    const count = await as(db, 'authenticated', users.carl, async (tx) => {
      await save(tx, ['listed']);
      await tx.exec('reset role');
      await tx.query('select private.close_directory()');
      return (await tx.query('select * from public.sharing_consents')).rows.length;
    });
    expect(count).toBe(1);
    await expect(as(db, 'authenticated', users.carl, (tx) => tx.query('select private.close_directory()'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

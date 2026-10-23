/**
 * Activity sign-ups and the waiting list, enforced by the database itself.
 * Runs the real migrations on PGlite with the fake data from supabase/seed.sql:
 * 'fake-two-places' has 2 places, 'fake-adults-only' is not for children,
 * 'fake-started' is in the past and 'fake-cancelled' is cancelled.
 */
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createTestDatabase, households, people, users } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

/** Switch the logged-in user inside one transaction, to play out a scenario between households. */
const actAs = (tx: Transaction, userId: string) =>
  tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);

async function signUp(tx: Transaction, activity: string, personIds: string[], overCapacity = false) {
  const { rows } = await tx.query<{ status: string }>('select public.sign_up($1, $2::uuid[], $3) as status', [
    activity,
    personIds,
    overCapacity,
  ]);
  return rows[0].status;
}

/** Status of each person on an activity, read as the organiser (who sees everything). */
async function statuses(tx: Transaction, activity: string) {
  await actAs(tx, users.ada);
  const { rows } = await tx.query<{ person_id: string; status: string }>(
    'select person_id, status from public.activity_signups where activity_id = $1',
    [activity],
  );
  return Object.fromEntries(rows.map((r) => [r.person_id, r.status]));
}

/** Bea and Bobby have no RSVP in the seed. Ben replies yes for them. */
async function exampleFamilyComing(tx: Transaction) {
  await actAs(tx, users.ben);
  await tx.query(`insert into public.rsvps (person_id, attending) values ($1, 'yes'), ($2, 'yes')`, [people.bea, people.bobby]);
}
const exampleFamily = [people.ben, people.bea, people.bobby];

describe('who can see activities', () => {
  it('not logged in: no access at all', async () => {
    await expect(as(db, 'anon', null, (tx) => tx.query('select * from public.activities'))).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', null, (tx) => tx.query('select * from public.activity_signups'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, 'anon', null, (tx) => tx.query('select public.activity_overview()'))).rejects.toThrow(/permission denied/);
  });

  it('a login that is not on the guest list sees nothing and cannot sign up', async () => {
    const result = await as(db, 'authenticated', users.stranger, async (tx) => ({
      activities: (await tx.query('select * from public.activities')).rows.length,
      overview: (await tx.query('select * from public.activity_overview()')).rows.length,
    }));
    expect(result).toEqual({ activities: 0, overview: 0 });
    await expect(
      as(db, 'authenticated', users.stranger, (tx) => signUp(tx, 'fake-unlimited', [people.carl])),
    ).rejects.toThrow(/not on the guest list/);
  });

  it('a guest reads every activity, and counts but no names from other households', async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await exampleFamilyComing(tx);
      await signUp(tx, 'fake-unlimited', exampleFamily);
      await actAs(tx, users.carl);
      const activities = (await tx.query('select id from public.activities')).rows.length;
      const signups = (await tx.query('select * from public.activity_signups')).rows.length;
      const { rows } = await tx.query(`select * from public.activity_overview() where activity_id = 'fake-unlimited'`);
      return { activities, signups, overview: rows[0] };
    });
    expect(result).toEqual({
      activities: 5,
      signups: 0,
      overview: { activity_id: 'fake-unlimited', confirmed: 3, waitlisted: 0 },
    });
  });
});

describe('signing up', () => {
  it('a guest signs up members of their own household, including a child', async () => {
    const result = await as(db, 'authenticated', users.bea, async (tx) => {
      await exampleFamilyComing(tx);
      await actAs(tx, users.bea);
      const status = await signUp(tx, 'fake-unlimited', exampleFamily);
      const again = await signUp(tx, 'fake-unlimited', [people.ben]);
      const { rows } = await tx.query('select count(*)::int as n from public.activity_signups');
      return { status, again, visible: rows[0] };
    });
    expect(result).toEqual({ status: 'confirmed', again: 'unchanged', visible: { n: 3 } });
  });

  it("cannot sign up someone from another household", async () => {
    await expect(as(db, 'authenticated', users.ben, (tx) => signUp(tx, 'fake-unlimited', [people.carl]))).rejects.toThrow(
      /own household/,
    );
  });

  it('cannot insert, or set a status, directly', async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) =>
        tx.query(
          `insert into public.activity_signups (activity_id, person_id, group_id, status)
           values ('fake-two-places', $1, gen_random_uuid(), 'confirmed')`,
          [people.ben],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      as(db, 'authenticated', users.dora, async (tx) => {
        await signUp(tx, 'fake-unlimited', [people.dora]);
        await tx.query(`update public.activity_signups set status = 'waitlisted'`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot change an activity or call the sync', async () => {
    await expect(
      as(db, 'authenticated', users.ben, (tx) => tx.query(`update public.activities set capacity = 99`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, 'authenticated', users.ada, (tx) => tx.query(`select public.sync_activities('[]'::jsonb, now())`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('needs an RSVP of yes or maybe first', async () => {
    // Bea has not replied yet.
    await expect(as(db, 'authenticated', users.ben, (tx) => signUp(tx, 'fake-unlimited', [people.bea]))).rejects.toThrow(
      /RSVP/,
    );
    // Carl replied 'maybe', which is enough.
    const maybe = await as(db, 'authenticated', users.carl, (tx) => signUp(tx, 'fake-unlimited', [people.carl]));
    expect(maybe).toBe('confirmed');
  });

  it('children cannot be signed up for an adults-only activity, adults can', async () => {
    await expect(
      as(db, 'authenticated', users.ben, async (tx) => {
        await exampleFamilyComing(tx);
        return signUp(tx, 'fake-adults-only', exampleFamily);
      }),
    ).rejects.toThrow(/not suitable for children/);
    const adults = await as(db, 'authenticated', users.ben, async (tx) => {
      await exampleFamilyComing(tx);
      return signUp(tx, 'fake-adults-only', [people.ben, people.bea]);
    });
    expect(adults).toBe('confirmed');
  });

  it('is closed once an activity has started or when it is cancelled', async () => {
    await expect(as(db, 'authenticated', users.dora, (tx) => signUp(tx, 'fake-started', [people.dora]))).rejects.toThrow(
      /already started/,
    );
    await expect(as(db, 'authenticated', users.dora, (tx) => signUp(tx, 'fake-cancelled', [people.dora]))).rejects.toThrow(
      /cancelled/,
    );
  });

  it('two households cannot both get the last place', async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      const carl = await signUp(tx, 'fake-two-places', [people.carl]);
      await actAs(tx, users.dora);
      const dora = await signUp(tx, 'fake-two-places', [people.dora]);
      await actAs(tx, users.ben);
      const ben = await signUp(tx, 'fake-two-places', [people.ben]);
      return { carl, dora, ben };
    });
    expect(result).toEqual({ carl: 'confirmed', dora: 'confirmed', ben: 'waitlisted' });
  });
});

describe('the waiting list', () => {
  /** 2 places: Carl and Dora get them, the Example family (3) waits, then Ada (organiser) waits behind them. */
  async function fullActivity(tx: Transaction) {
    await exampleFamilyComing(tx);
    await actAs(tx, users.carl);
    await signUp(tx, 'fake-two-places', [people.carl]);
    await actAs(tx, users.dora);
    await signUp(tx, 'fake-two-places', [people.dora]);
    await actAs(tx, users.ben);
    const family = await signUp(tx, 'fake-two-places', exampleFamily);
    await actAs(tx, users.ada);
    const ada = await signUp(tx, 'fake-two-places', [people.ada]);
    return { family, ada };
  }

  it('a whole group waits when it does not fit, with the right number of people ahead', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      const outcome = await fullActivity(tx);
      await actAs(tx, users.ben);
      const familyAhead = (await tx.query('select people_ahead from public.my_waitlist_positions()')).rows;
      await actAs(tx, users.ada);
      const adaAhead = (await tx.query('select people_ahead from public.my_waitlist_positions()')).rows;
      return { ...outcome, familyAhead, adaAhead };
    });
    expect(result).toEqual({
      family: 'waitlisted',
      ada: 'waitlisted',
      familyAhead: [{ people_ahead: 0 }],
      adaAhead: [{ people_ahead: 3 }],
    });
  });

  it('a freed place goes to the first group that fits, without splitting a family', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await actAs(tx, users.carl);
      const { affectedRows } = await tx.query(`delete from public.activity_signups where activity_id = 'fake-two-places'`);
      return { cancelled: affectedRows, after: await statuses(tx, 'fake-two-places') };
    });
    expect(result.cancelled).toBe(1); // only Carl's own row
    expect(result.after).toEqual({
      [people.dora]: 'confirmed',
      [people.ada]: 'confirmed', // jumped the family, who need 3 places
      [people.ben]: 'waitlisted',
      [people.bea]: 'waitlisted',
      [people.bobby]: 'waitlisted',
    });
  });

  it('raising the capacity in the content promotes the waiting family', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await tx.exec('set local role service_role');
      await tx.query(`select public.sync_activities($1::jsonb, now())`, [
        JSON.stringify([
          { id: 'fake-two-places', title: 'Fake boat trip', starts_at: '2027-05-27T14:00+03:00', capacity: 5, kid_friendly: true, cancelled: false },
        ]),
      ]);
      await tx.exec('set local role authenticated');
      return statuses(tx, 'fake-two-places');
    });
    // 2 + family of 3 = 5. Ada, behind them, still waits.
    expect(result).toEqual({
      [people.carl]: 'confirmed',
      [people.dora]: 'confirmed',
      [people.ben]: 'confirmed',
      [people.bea]: 'confirmed',
      [people.bobby]: 'confirmed',
      [people.ada]: 'waitlisted',
    });
  });

  it('lowering the capacity keeps everyone already confirmed', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await tx.exec('set local role service_role');
      await tx.query(`select public.sync_activities($1::jsonb, now())`, [
        JSON.stringify([
          { id: 'fake-two-places', title: 'Fake boat trip', starts_at: '2027-05-27T14:00+03:00', capacity: 1, kid_friendly: true, cancelled: false },
        ]),
      ]);
      await tx.exec('set local role authenticated');
      return statuses(tx, 'fake-two-places');
    });
    expect(result[people.carl]).toBe('confirmed');
    expect(result[people.dora]).toBe('confirmed');
  });

  it('removing a guest from the guest list frees their place', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await actAs(tx, users.ada);
      await tx.query('delete from public.households where id = $1', [households.demo]);
      return statuses(tx, 'fake-two-places');
    });
    expect(result[people.ada]).toBe('confirmed');
    expect(result[people.dora]).toBeUndefined();
  });

  it('replying "no" to the party leaves activities, and the place is passed on', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await actAs(tx, users.dora);
      await tx.query(`update public.rsvps set attending = 'no' where person_id = $1`, [people.dora]);
      return statuses(tx, 'fake-two-places');
    });
    expect(result[people.dora]).toBeUndefined();
    expect(result[people.ada]).toBe('confirmed');
  });
});

describe('cancelling', () => {
  it("a guest cannot cancel another household's sign-up", async () => {
    const result = await as(db, 'authenticated', users.carl, async (tx) => {
      await signUp(tx, 'fake-unlimited', [people.carl]);
      await actAs(tx, users.dora);
      const { affectedRows } = await tx.query('delete from public.activity_signups');
      return { deleted: affectedRows, left: await statuses(tx, 'fake-unlimited') };
    });
    expect(result).toEqual({ deleted: 0, left: { [people.carl]: 'confirmed' } });
  });

  it('a guest cannot cancel once the activity has started, an organiser can', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await signUp(tx, 'fake-started', [people.dora]);
      await actAs(tx, users.dora);
      const byGuest = (await tx.query('delete from public.activity_signups')).affectedRows;
      await actAs(tx, users.ada);
      const byOrganiser = (await tx.query('delete from public.activity_signups')).affectedRows;
      return { byGuest, byOrganiser };
    });
    expect(result).toEqual({ byGuest: 0, byOrganiser: 1 });
  });
});

describe('an organiser', () => {
  it('can sign up anyone, even without an RSVP or after the start', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => ({
      bea: await signUp(tx, 'fake-unlimited', [people.bea]),
      started: await signUp(tx, 'fake-started', [people.carl]),
    }));
    expect(result).toEqual({ bea: 'confirmed', started: 'confirmed' });
  });

  it('can give places over capacity, also to someone already waiting', async () => {
    const result = await as(db, 'authenticated', users.ada, async (tx) => {
      await fullActivity(tx);
      await actAs(tx, users.ada);
      const moved = await signUp(tx, 'fake-two-places', [people.ada], true);
      return { moved, after: await statuses(tx, 'fake-two-places') };
    });
    expect(result.moved).toBe('confirmed');
    expect(result.after[people.ada]).toBe('confirmed');
    expect(result.after[people.ben]).toBe('waitlisted');
  });

  /** Same scenario as in 'the waiting list', for the organiser tests. */
  async function fullActivity(tx: Transaction) {
    await exampleFamilyComing(tx);
    await actAs(tx, users.carl);
    await signUp(tx, 'fake-two-places', [people.carl]);
    await actAs(tx, users.dora);
    await signUp(tx, 'fake-two-places', [people.dora]);
    await actAs(tx, users.ben);
    await signUp(tx, 'fake-two-places', exampleFamily);
    await actAs(tx, users.ada);
    await signUp(tx, 'fake-two-places', [people.ada]);
  }
});

describe('syncing activities from the content', () => {
  const activity = (title: string) => ({
    id: 'fake-unlimited',
    title,
    starts_at: '2027-05-27T10:00+03:00',
    capacity: null,
    kid_friendly: true,
    cancelled: false,
  });

  async function sync(tx: Transaction, items: unknown[], builtAt: string) {
    await tx.query('select public.sync_activities($1::jsonb, $2)', [JSON.stringify(items), builtAt]);
    return (await tx.query<{ id: string; title: string; in_content: boolean }>('select id, title, in_content from public.activities order by id')).rows;
  }

  it('updates activities, and marks ones whose file was deleted', async () => {
    const rows = await as(db, 'service_role', null, (tx) => sync(tx, [activity('New title')], '2026-06-01T00:00Z'));
    expect(rows.find((r) => r.id === 'fake-unlimited')).toEqual({ id: 'fake-unlimited', title: 'New title', in_content: true });
    expect(rows.filter((r) => !r.in_content).map((r) => r.id)).toEqual([
      'fake-adults-only',
      'fake-cancelled',
      'fake-started',
      'fake-two-places',
    ]);
  });

  it('ignores an older build and an empty list', async () => {
    const rows = await as(db, 'service_role', null, async (tx) => {
      await sync(tx, [activity('New title')], '2026-06-01T00:00Z');
      await sync(tx, [activity('Old title')], '2026-03-01T00:00Z');
      return sync(tx, [], '2026-07-01T00:00Z');
    });
    expect(rows.find((r) => r.id === 'fake-unlimited')?.title).toBe('New title');
    expect(rows.find((r) => r.id === 'fake-two-places')?.in_content).toBe(false);
  });

  it('a sign-up to an activity no longer in the content is refused', async () => {
    await expect(
      as(db, 'authenticated', users.dora, async (tx) => {
        await tx.exec('set local role service_role');
        await sync(tx, [activity('Only this one')], '2026-06-01T00:00Z');
        await tx.exec('set local role authenticated');
        return signUp(tx, 'fake-two-places', [people.dora]);
      }),
    ).rejects.toThrow(/no longer on the programme/);
  });
});

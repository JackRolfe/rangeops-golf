import type { Db } from './db.js';

/**
 * The demo range from the spec. Idempotent: does nothing if a range with the
 * slug `demo` exists. Later tickets add to it (staff, robots, passes).
 */
export async function seedDemo(db: Db): Promise<boolean> {
  const existing = await db.maybeOne<{ id: string }>("select id from ranges where slug = 'demo'");
  if (existing) return false;

  await db.tx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into ranges (slug, name, time_zone, currency, off_peak_cents, peak_cents)
       values ('demo', 'RangeOps Demo Range', 'Australia/Sydney', 'AUD', 1800, 2800) returning id`,
    );
    const rangeId = rows[0]!.id;

    for (let n = 1; n <= 8; n++) {
      await tx.query('insert into bays (range_id, number, name) values ($1, $2, $3)', [rangeId, n, `Bay ${n}`]);
    }
    for (let d = 0; d <= 6; d++) {
      await tx.query('insert into opening_hours (range_id, weekday, opens_min, closes_min) values ($1, $2, 420, 1320)', [rangeId, d]);
    }
    for (let d = 1; d <= 5; d++) {
      await tx.query('insert into peak_windows (range_id, weekday, from_min, to_min) values ($1, $2, 960, 1260)', [rangeId, d]);
    }
    for (const d of [0, 6]) {
      await tx.query('insert into peak_windows (range_id, weekday, from_min, to_min) values ($1, $2, 480, 840)', [rangeId, d]);
    }
    await tx.query(
      `insert into addon_prices (range_id, kind, cents, unit) values
         ($1, 'robot', 1500, 'per_hour'), ($1, 'club_hire', 1000, 'per_booking'), ($1, 'lesson', 7000, 'per_booking')`,
      [rangeId],
    );
    await tx.query(
      `insert into bucket_products (range_id, name, balls, cents) values
         ($1, 'Small bucket', 50, 1000), ($1, 'Medium bucket', 100, 1800), ($1, 'Large bucket', 150, 2400)`,
      [rangeId],
    );
    const staff = await tx.query<{ id: string }>("insert into accounts (email, name) values ('staff@rangeops.test', 'Demo Staff') returning id");
    await tx.query('insert into range_staff (account_id, range_id) values ($1, $2)', [staff.rows[0]!.id, rangeId]);
  });
  return true;
}

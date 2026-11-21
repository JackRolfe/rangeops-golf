// A busy day at the demo range, so the console has something to show locally: bookings from the app
// and from other systems, robot hires, check-ins, bucket orders (some handed over), a pass and ball credit.
// Run by the server when SEED_DEMO_DAY=1. Does nothing if the day already has bookings.
import { buyPass } from '../balls/passes.js';
import { buyBucket, redeemBucketCode } from '../balls/service.js';
import { createBooking } from '../bookings/service.js';
import type { Deps } from '../deps.js';
import { loadRange } from '../ranges/repo.js';
import { findRange } from '../ranges/repo.js';
import { HOUR_MS, localDate, zonedInstant } from '../time.js';

const PLAYERS = [
  ['nguyen.family@example.com', 'The Nguyen family'],
  ['priya@example.com', 'Priya Shah'],
  ['walkers@example.com', 'Tom & Mia Walker'],
  ['hannah@example.com', 'Hannah Lee'],
  ['sam@example.com', 'Sam Okafor'],
  ['grace@example.com', 'Grace Tan'],
] as const;
const WALK_INS = ['Walk-in family', 'Phone booking: Rossi', 'Counter: Ari Cohen', 'Birthday party'];

export async function seedDemoDay(deps: Deps, rangeSlug = 'demo'): Promise<{ bookings: number; buckets: number }> {
  const { db } = deps;
  const range = await findRange(db, rangeSlug);
  const data = await loadRange(db, range.id);
  const tz = range.time_zone;
  const realNow = deps.now();
  const date = localDate(realNow, tz);
  const dayStart = zonedInstant(date, 0, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * HOUR_MS);
  const existing = await db.maybeOne('select 1 from bookings where range_id = $1 and starts_at >= $2 and starts_at < $3 limit 1', [range.id, dayStart, dayEnd]);
  if (existing) return { bookings: 0, buckets: 0 };

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = data.hours.find((h) => h.weekday === weekday);
  if (!hours) return { bookings: 0, buckets: 0 };

  // A clock of our own, so bookings for earlier today are made "before" they start.
  let at = new Date(Math.min(zonedInstant(date, hours.opens_min - 60, tz).getTime(), realNow.getTime()));
  const seedDeps: Deps = { ...deps, now: () => new Date(at) };

  const accounts: string[] = [];
  for (const [email, name] of PLAYERS) {
    const row = await db.one<{ id: string }>(
      `insert into accounts (email, name) values ($1, $2) on conflict (email) do update set name = coalesce(accounts.name, excluded.name) returning id`,
      [email, name],
    );
    accounts.push(row.id);
  }
  const staff = await db.one<{ account_id: string }>('select account_id from range_staff where range_id = $1 limit 1', [range.id]);

  let bookings = 0;
  let n = 0;
  const firstHour = Math.ceil(hours.opens_min / 60);
  const lastHour = Math.floor(hours.closes_min / 60);
  for (const bay of data.bays.filter((b) => b.active)) {
    for (let hour = firstHour; hour < lastHour; ) {
      const pattern = (bay.number * 7 + hour * 3) % 5;
      if (pattern >= 2) {
        hour += 1;
        continue;
      }
      const length = Math.min(pattern === 0 ? 1 : 2, lastHour - hour);
      n += 1;
      const external = n % 3 === 0;
      const robot = n % 4 === 1;
      const base = {
        bayId: bay.id,
        startsAt: zonedInstant(date, hour * 60, tz),
        hours: length,
        accountId: external ? null : accounts[n % accounts.length]!,
        source: external ? ('external' as const) : ('rangeops' as const),
        externalRef: external ? `DEMO-${date}-${n}` : undefined,
        customerName: external ? WALK_INS[n % WALK_INS.length] : undefined,
        paymentMethod: external ? undefined : 'pm_fake_ok',
      };
      try {
        await createBooking(seedDeps, { ...base, addOns: robot ? [{ kind: 'robot' }] : [] });
        bookings += 1;
      } catch {
        // No robot free for those hours: book the bay alone.
        try {
          await createBooking(seedDeps, { ...base, addOns: [] });
          bookings += 1;
        } catch {
          /* the bay is taken or the hour is closed; skip it */
        }
      }
      hour += length + (n % 2);
    }
  }

  // Players who have arrived are checked in, except the odd one running late.
  await db.many(
    `update bookings set checked_in_at = starts_at + interval '4 minutes'
     where range_id = $1 and starts_at >= $2 and starts_at <= $3 and status = 'confirmed'
       and (extract(epoch from starts_at)::bigint / 3600) % 7 <> 3`,
    [range.id, dayStart, realNow],
  );

  // Buckets bought through the day, counting back from now; all but the newest few handed over.
  const products = data.buckets.filter((b) => b.active);
  const opens = zonedInstant(date, hours.opens_min, tz).getTime();
  let buckets = 0;
  for (let k = 0; k < 18 && products.length; k += 1) {
    const paidAt = realNow.getTime() - (6 + k * 23) * 60_000;
    if (paidAt < opens) break;
    at = new Date(paidAt);
    const product = products[k % products.length]!;
    const { code } = await buyBucket(seedDeps, accounts[k % accounts.length]!, range.id, product.id, { method: 'card', paymentMethod: 'pm_fake_ok' });
    buckets += 1;
    if (k >= 3) {
      at = new Date(paidAt + 4 * 60_000);
      await redeemBucketCode(seedDeps, range.id, code.code, staff.account_id);
    }
  }

  // A monthly pass and some ball credit, bought this morning.
  at = new Date(Math.min(opens + HOUR_MS, realNow.getTime() - 60_000));
  for (const [i, kind] of (['monthly_pass', 'ball_credit'] as const).entries()) {
    const product = data.passProducts.find((p) => p.kind === kind && p.active);
    if (product) await buyPass(seedDeps, accounts[i]!, range.id, product.id, 'pm_fake_ok');
  }

  // Robots out on a hire running now report that they are driving; the rest are idle on the dock.
  await db.many(
    `update robots r set last_state = case when h.id is null then 'idle' else 'driving' end,
       battery_pct = case when h.id is null then 96 else 71 end, balls_on_board = case when h.id is null then 0 else 4 end, last_seen_at = $2
     from robots r2 left join hires h on h.robot_id = r2.id and h.status = 'active' and h.starts_at <= $2 and h.ends_at > $2
     where r.id = r2.id and r.range_id = $1`,
    [range.id, realNow],
  );

  return { bookings, buckets };
}

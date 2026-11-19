import type { Deps } from '../deps.js';
import { HOUR_MS } from '../time.js';
import type { RangeData } from './repo.js';

export interface AvailabilityCounts {
  bayBusy: (bayId: string, startsAt: Date) => boolean;
  robotsFree: number[];
}

const overlaps = (aStart: Date, aEnd: Date, bStart: number, bEnd: number) => aStart.getTime() < bEnd && bStart < aEnd.getTime();

/** Which bay-hours are taken, and how many robots are free in each hour. */
export async function availabilityCounts(deps: Deps, data: RangeData, starts: Date[]): Promise<AvailabilityCounts> {
  if (starts.length === 0) return { bayBusy: () => false, robotsFree: [] };
  const from = starts[0]!;
  const to = new Date(starts.at(-1)!.getTime() + HOUR_MS);
  const bookings = await deps.db.many<{ bay_id: string; starts_at: Date; ends_at: Date }>(
    `select bay_id, starts_at, ends_at from bookings
     where range_id = $1 and status <> 'cancelled' and starts_at < $3 and ends_at > $2`,
    [data.range.id, from, to],
  );
  const robots = await deps.db.one<{ n: number }>('select count(*)::int as n from robots where range_id = $1 and in_service', [data.range.id]);
  const hires = await deps.db.many<{ starts_at: Date; ends_at: Date }>(
    `select h.starts_at, h.ends_at from hires h join robots r on r.id = h.robot_id
     where h.range_id = $1 and h.status <> 'cancelled' and r.in_service and h.starts_at < $3 and h.ends_at > $2`,
    [data.range.id, from, to],
  );
  return {
    bayBusy: (bayId, t) =>
      bookings.some((b) => b.bay_id === bayId && overlaps(b.starts_at, b.ends_at, t.getTime(), t.getTime() + HOUR_MS)),
    robotsFree: starts.map(
      (t) => robots.n - hires.filter((h) => overlaps(h.starts_at, h.ends_at, t.getTime(), t.getTime() + HOUR_MS)).length,
    ),
  };
}

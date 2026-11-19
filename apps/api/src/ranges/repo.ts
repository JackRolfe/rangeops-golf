import type { Db, Queryable } from '../db/db.js';
import { notFound } from '../errors.js';

export interface RangeRow {
  id: string;
  slug: string;
  name: string;
  time_zone: string;
  currency: string;
  off_peak_cents: number;
  peak_cents: number;
}

export interface BayRow {
  id: string;
  range_id: string;
  number: number;
  name: string;
  active: boolean;
  off_peak_cents: number | null;
  peak_cents: number | null;
}

export interface HoursRow {
  weekday: number;
  opens_min: number;
  closes_min: number;
}

export interface PeakRow {
  weekday: number;
  from_min: number;
  to_min: number;
}

export type AddOnKind = 'robot' | 'club_hire' | 'lesson';

export interface AddOnRow {
  kind: AddOnKind;
  cents: number;
  unit: 'per_hour' | 'per_booking';
}

export interface BucketProductRow {
  id: string;
  range_id: string;
  name: string;
  balls: number;
  cents: number;
  active: boolean;
}

/** A range with everything needed to price and check a booking. */
export interface RangeData {
  range: RangeRow;
  bays: BayRow[];
  hours: HoursRow[];
  peaks: PeakRow[];
  addOns: AddOnRow[];
  buckets: BucketProductRow[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finds a range by id or by slug (`demo`), or throws 404. */
export async function findRange(db: Db, idOrSlug: string, q?: Queryable): Promise<RangeRow> {
  const range = await db.maybeOne<RangeRow>(
    UUID.test(idOrSlug) ? 'select * from ranges where id = $1' : 'select * from ranges where slug = $1',
    [idOrSlug],
    q,
  );
  if (!range) throw notFound(`No range ${idOrSlug}.`);
  return range;
}

export async function loadRange(db: Db, idOrSlug: string, q?: Queryable): Promise<RangeData> {
  const range = await findRange(db, idOrSlug, q);
  const id = range.id;
  const [bays, hours, peaks, addOns, buckets] = await Promise.all([
    db.many<BayRow>('select * from bays where range_id = $1 order by number', [id], q),
    db.many<HoursRow>('select weekday, opens_min, closes_min from opening_hours where range_id = $1 order by weekday', [id], q),
    db.many<PeakRow>('select weekday, from_min, to_min from peak_windows where range_id = $1 order by weekday, from_min', [id], q),
    db.many<AddOnRow>('select kind, cents, unit from addon_prices where range_id = $1 order by kind', [id], q),
    db.many<BucketProductRow>('select * from bucket_products where range_id = $1 order by balls', [id], q),
  ]);
  return { range, bays, hours, peaks, addOns, buckets };
}

export async function findBay(db: Db, bayId: string, q?: Queryable): Promise<BayRow> {
  const bay = UUID.test(bayId)
    ? await db.maybeOne<BayRow>('select * from bays where id = $1', [bayId], q)
    : undefined;
  if (!bay) throw notFound(`No bay ${bayId}.`);
  return bay;
}

export const isUuid = (s: string) => UUID.test(s);

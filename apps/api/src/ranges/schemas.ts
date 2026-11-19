import { z } from '@hono/zod-openapi';
import type { PassProductRow } from '../balls/passes.js';
import { minutesToHhmm } from '../time.js';
import type { AddOnRow, BayRow, BucketProductRow, HoursRow, PeakRow, RangeData, RangeRow } from './repo.js';

export const Cents = z.number().int().openapi({ description: 'Money in cents of the range currency', example: 1800 });
export const Instant = z.string().datetime({ offset: true }).openapi({ example: '2026-11-24T05:00:00.000Z' });
export const LocalTime = z.string().openapi({ description: 'Local time HH:MM, 24-hour; "24:00" is midnight at the end of the day', example: '07:00' });
export const Weekday = z.number().int().min(0).max(6).openapi({ description: '0 Sunday to 6 Saturday' });

export const RangeSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().openapi({ example: 'demo' }),
    name: z.string(),
    timeZone: z.string().openapi({ example: 'Australia/Sydney' }),
    currency: z.string().openapi({ example: 'AUD' }),
  })
  .openapi('RangeSummary');

export const BaySchema = z
  .object({
    id: z.string().uuid(),
    rangeId: z.string().uuid(),
    number: z.number().int().min(1).max(255),
    name: z.string(),
    active: z.boolean(),
    offPeakCentsPerHour: Cents.nullable().openapi({ description: "Overrides the range's off-peak price when set" }),
    peakCentsPerHour: Cents.nullable().openapi({ description: "Overrides the range's peak price when set" }),
  })
  .openapi('Bay');

export const OpeningHoursSchema = z
  .object({ weekday: Weekday, opens: LocalTime, closes: LocalTime })
  .openapi('OpeningHours');

export const PeakWindowSchema = z
  .object({ weekday: Weekday, from: LocalTime, to: LocalTime })
  .openapi('PeakWindow', { description: 'Bay-hours starting inside a window cost the peak price' });

export const AddOnKindSchema = z.enum(['robot', 'club_hire', 'lesson']).openapi('AddOnKind');

export const AddOnPriceSchema = z
  .object({ kind: AddOnKindSchema, priceCents: Cents, unit: z.enum(['per_hour', 'per_booking']) })
  .openapi('AddOnPrice');

export const BucketProductSchema = z
  .object({ id: z.string().uuid(), name: z.string(), balls: z.number().int(), priceCents: Cents, active: z.boolean() })
  .openapi('BucketProduct');

export const PassProductSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['monthly_pass', 'ball_credit']),
    name: z.string(),
    priceCents: Cents,
    days: z.number().int().nullable().openapi({ description: 'monthly_pass: days it lasts' }),
    discountPercent: z.number().int().nullable().openapi({ description: 'monthly_pass: percent off bay-hours and card-paid buckets' }),
    balls: z.number().int().nullable().openapi({ description: 'ball_credit: balls added to your credit at this range' }),
    active: z.boolean(),
  })
  .openapi('PassProduct');

export const RangeSchema = RangeSummarySchema.extend({
  prices: z.object({
    offPeakCentsPerHour: Cents,
    peakCentsPerHour: Cents,
    floorCentsPerHour: Cents.openapi({ description: 'The least a bay-hour may cost. No price can be set below it; 0 is no floor.' }),
  }),
  openingHours: z.array(OpeningHoursSchema),
  peakWindows: z.array(PeakWindowSchema),
  bays: z.array(BaySchema),
  addOns: z.array(AddOnPriceSchema),
  bucketProducts: z.array(BucketProductSchema),
  passProducts: z.array(PassProductSchema),
}).openapi('Range');

export const rangeSummary = (r: RangeRow): z.infer<typeof RangeSummarySchema> => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  timeZone: r.time_zone,
  currency: r.currency,
});

export const bayOut = (b: BayRow): z.infer<typeof BaySchema> => ({
  id: b.id,
  rangeId: b.range_id,
  number: b.number,
  name: b.name,
  active: b.active,
  offPeakCentsPerHour: b.off_peak_cents,
  peakCentsPerHour: b.peak_cents,
});

export const hoursOut = (h: HoursRow) => ({ weekday: h.weekday, opens: minutesToHhmm(h.opens_min), closes: minutesToHhmm(h.closes_min) });
export const peakOut = (p: PeakRow) => ({ weekday: p.weekday, from: minutesToHhmm(p.from_min), to: minutesToHhmm(p.to_min) });
export const addOnOut = (a: AddOnRow) => ({ kind: a.kind, priceCents: a.cents, unit: a.unit });
export const bucketProductOut = (b: BucketProductRow) => ({ id: b.id, name: b.name, balls: b.balls, priceCents: b.cents, active: b.active });

export const passProductOut = (p: PassProductRow): z.infer<typeof PassProductSchema> => ({
  id: p.id,
  kind: p.kind,
  name: p.name,
  priceCents: p.cents,
  days: p.days,
  discountPercent: p.discount_pct,
  balls: p.balls,
  active: p.active,
});

export function rangeOut(d: RangeData): z.infer<typeof RangeSchema> {
  return {
    ...rangeSummary(d.range),
    prices: { offPeakCentsPerHour: d.range.off_peak_cents, peakCentsPerHour: d.range.peak_cents, floorCentsPerHour: d.range.floor_cents },
    openingHours: d.hours.map(hoursOut),
    peakWindows: d.peaks.map(peakOut),
    bays: d.bays.map(bayOut),
    addOns: d.addOns.map(addOnOut),
    bucketProducts: d.buckets.map(bucketProductOut),
    passProducts: d.passProducts.map(passProductOut),
  };
}

export const RangeIdParam = z.object({
  rangeId: z.string().openapi({ param: { name: 'rangeId', in: 'path' }, description: 'Range id, or its slug', example: 'demo' }),
});

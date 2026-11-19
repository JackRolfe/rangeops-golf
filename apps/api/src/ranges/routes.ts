import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import type { Deps } from '../deps.js';
import { errors } from '../errors.js';
import { hourSlot, openHourStarts } from '../pricing.js';
import { isCalendarDate, localDate, localHhmm, minutesToHhmm } from '../time.js';
import { availabilityCounts } from './availability.js';
import { loadRange, type RangeRow } from './repo.js';
import { Cents, Instant, LocalTime, RangeIdParam, RangeSchema, RangeSummarySchema, rangeOut, rangeSummary } from './schemas.js';

const listRanges = createRoute({
  method: 'get',
  path: '/ranges',
  tags: ['Ranges'],
  summary: 'List RangeOps ranges',
  responses: {
    200: { description: 'Every range', content: { 'application/json': { schema: z.object({ ranges: z.array(RangeSummarySchema) }) } } },
  },
});

const getRange = createRoute({
  method: 'get',
  path: '/ranges/{rangeId}',
  tags: ['Ranges'],
  summary: 'A range: bays, hours, prices and products',
  request: { params: RangeIdParam },
  responses: {
    200: { description: 'The range', content: { 'application/json': { schema: RangeSchema } } },
    ...errors(404),
  },
});

const SlotSchema = z
  .object({
    startsAt: Instant,
    endsAt: Instant,
    localTime: LocalTime,
    peak: z.boolean(),
    priceCents: Cents,
    free: z.boolean(),
  })
  .openapi('Slot');

const AvailabilitySchema = z
  .object({
    rangeId: z.string().uuid(),
    date: z.string().openapi({ example: '2026-11-24' }),
    timeZone: z.string(),
    hours: z.array(
      z.object({ startsAt: Instant, localTime: LocalTime, robotsFree: z.number().int() }),
    ).openapi({ description: 'Each open hour of the day, with how many robots could be hired for it' }),
    bays: z.array(
      z.object({ bayId: z.string().uuid(), number: z.number().int(), name: z.string(), slots: z.array(SlotSchema) }),
    ),
  })
  .openapi('Availability');

const getAvailability = createRoute({
  method: 'get',
  path: '/ranges/{rangeId}/availability',
  tags: ['Ranges'],
  summary: 'Free bays and robots, hour by hour, on one local date',
  request: {
    params: RangeIdParam,
    query: z.object({
      date: z
        .string()
        .optional()
        .openapi({ param: { name: 'date', in: 'query' }, description: "YYYY-MM-DD in the range's time zone; today if left out", example: '2026-11-24' }),
    }),
  },
  responses: {
    200: { description: 'Every open hour of every active bay', content: { 'application/json': { schema: AvailabilitySchema } } },
    ...errors(400, 404),
  },
});

export function rangeRoutes(app: Api, deps: Deps) {
  const { db } = deps;

  app.openapi(listRanges, async (c) => {
    const rows = await db.many<RangeRow>('select * from ranges order by name');
    return c.json({ ranges: rows.map(rangeSummary) }, 200);
  });

  app.openapi(getRange, async (c) => {
    const data = await loadRange(db, c.req.valid('param').rangeId);
    return c.json(rangeOut(data), 200);
  });

  app.openapi(getAvailability, async (c) => {
    const data = await loadRange(db, c.req.valid('param').rangeId);
    const date = c.req.valid('query').date ?? localDate(deps.now(), data.range.time_zone);
    if (!isCalendarDate(date)) {
      return c.json({ error: { code: 'bad_request', message: 'date must be YYYY-MM-DD.' } }, 400);
    }
    const starts = openHourStarts(data, date);
    const counts = await availabilityCounts(deps, data, starts);
    const bays = data.bays.filter((b) => b.active);
    return c.json(
      {
        rangeId: data.range.id,
        date,
        timeZone: data.range.time_zone,
        hours: starts.map((t, i) => ({
          startsAt: t.toISOString(),
          localTime: localHhmm(t, data.range.time_zone),
          robotsFree: counts.robotsFree[i]!,
        })),
        bays: bays.map((bay) => ({
          bayId: bay.id,
          number: bay.number,
          name: bay.name,
          slots: starts.map((t) => {
            const s = hourSlot(data, bay, t);
            return {
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
              localTime: minutesToHhmm(s.localMinutes),
              peak: s.peak,
              priceCents: s.priceCents,
              free: !counts.bayBusy(bay.id, t),
            };
          }),
        })),
      },
      200,
    );
  });
}

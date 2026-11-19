import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireStaff } from '../auth/auth.js';
import { BucketCodeSchema, bucketCodeOut, type BucketCodeRow } from '../balls/schemas.js';
import { bearer } from '../auth/schemas.js';
import { AddOnRequestSchema, BookingSchema, bookingOut } from '../bookings/schemas.js';
import { createBooking, MAX_HOURS, type BookingRow } from '../bookings/service.js';
import type { Deps } from '../deps.js';
import { badRequest, conflict, errors, notFound } from '../errors.js';
import { OrderSchema, orderOut, type OrderRow } from '../orders/service.js';
import { findBay, findRange, loadRange, type BayRow } from '../ranges/repo.js';
import { Cents, Instant, LocalTime, RangeIdParam, RangeSchema, Weekday, rangeOut } from '../ranges/schemas.js';
import { addDays, HHMM, hhmmToMinutes, isCalendarDate, localDate, zonedInstant } from '../time.js';

const StaffBaySchema = z
  .object({
    id: z.string().uuid(),
    rangeId: z.string().uuid(),
    number: z.number().int().min(1).max(255),
    name: z.string(),
    active: z.boolean(),
    offPeakCentsPerHour: Cents.nullable(),
    peakCentsPerHour: Cents.nullable(),
    checkInCode: z.string().openapi({ description: "The secret in the bay's QR code" }),
    checkInUrl: z.string().url().openapi({ description: 'What the QR code should encode: APP_URL/check-in/<code>' }),
  })
  .openapi('StaffBay');

const BayIdParam = z.object({ bayId: z.string().uuid().openapi({ param: { name: 'bayId', in: 'path' } }) });
const DateQuery = z.object({
  date: z.string().optional().openapi({ param: { name: 'date', in: 'query' }, description: "YYYY-MM-DD in the range's time zone; today if left out" }),
});
const Time = LocalTime.regex(HHMM);

const routes = {
  updateRange: createRoute({
    method: 'patch',
    path: '/ranges/{rangeId}',
    tags: ['Console'],
    summary: 'Rename a range or change its bay-hour prices (staff)',
    description: 'Prices apply to new bookings; existing ones keep what they paid.',
    security: bearer,
    request: {
      params: RangeIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({ name: z.string().trim().min(1).max(100).optional(), offPeakCentsPerHour: Cents.min(0).optional(), peakCentsPerHour: Cents.min(0).optional() })
              .openapi('RangeUpdate'),
          },
        },
      },
    },
    responses: { 200: { description: 'The range', content: { 'application/json': { schema: RangeSchema } } }, ...errors(400, 401, 403, 404) },
  }),
  putHours: createRoute({
    method: 'put',
    path: '/ranges/{rangeId}/hours',
    tags: ['Console'],
    summary: "Replace the week's opening hours (staff)",
    description: 'One entry per open weekday; a weekday left out is closed. Existing bookings are not moved.',
    security: bearer,
    request: {
      params: RangeIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({ openingHours: z.array(z.object({ weekday: Weekday, opens: Time, closes: Time })).max(7) }).openapi('OpeningHoursUpdate'),
          },
        },
      },
    },
    responses: { 200: { description: 'The range', content: { 'application/json': { schema: RangeSchema } } }, ...errors(400, 401, 403, 404) },
  }),
  putPeaks: createRoute({
    method: 'put',
    path: '/ranges/{rangeId}/peak-windows',
    tags: ['Console'],
    summary: "Replace the week's peak windows (staff)",
    security: bearer,
    request: {
      params: RangeIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({ peakWindows: z.array(z.object({ weekday: Weekday, from: Time, to: Time })).max(50) }).openapi('PeakWindowsUpdate'),
          },
        },
      },
    },
    responses: { 200: { description: 'The range', content: { 'application/json': { schema: RangeSchema } } }, ...errors(400, 401, 403, 404) },
  }),
  listBays: createRoute({
    method: 'get',
    path: '/ranges/{rangeId}/bays',
    tags: ['Console'],
    summary: 'Bays with their check-in codes (staff)',
    security: bearer,
    request: { params: RangeIdParam },
    responses: {
      200: { description: 'Bays', content: { 'application/json': { schema: z.object({ bays: z.array(StaffBaySchema) }) } } },
      ...errors(401, 403, 404),
    },
  }),
  createBay: createRoute({
    method: 'post',
    path: '/ranges/{rangeId}/bays',
    tags: ['Console'],
    summary: 'Add a bay (staff)',
    security: bearer,
    request: {
      params: RangeIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                number: z.number().int().min(1).max(255).openapi({ description: "1 to 255: it is one byte of the robot's hire key" }),
                name: z.string().trim().min(1).max(60).optional(),
                offPeakCentsPerHour: Cents.min(0).nullable().optional(),
                peakCentsPerHour: Cents.min(0).nullable().optional(),
              })
              .openapi('NewBay'),
          },
        },
      },
    },
    responses: { 201: { description: 'Added', content: { 'application/json': { schema: StaffBaySchema } } }, ...errors(400, 401, 403, 404, 409) },
  }),
  updateBay: createRoute({
    method: 'patch',
    path: '/bays/{bayId}',
    tags: ['Console'],
    summary: "Rename a bay, close it, or set its own prices (staff)",
    description: "Set a price to null to use the range's price again.",
    security: bearer,
    request: {
      params: BayIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                name: z.string().trim().min(1).max(60).optional(),
                active: z.boolean().optional(),
                offPeakCentsPerHour: Cents.min(0).nullable().optional(),
                peakCentsPerHour: Cents.min(0).nullable().optional(),
              })
              .openapi('BayUpdate'),
          },
        },
      },
    },
    responses: { 200: { description: 'Updated', content: { 'application/json': { schema: StaffBaySchema } } }, ...errors(400, 401, 403, 404) },
  }),
  rotateCode: createRoute({
    method: 'post',
    path: '/bays/{bayId}/check-in-code',
    tags: ['Console'],
    summary: "Replace a bay's check-in code (staff)",
    description: 'The old QR code stops working. Print the new checkInUrl.',
    security: bearer,
    request: { params: BayIdParam },
    responses: { 200: { description: 'The bay with its new code', content: { 'application/json': { schema: StaffBaySchema } } }, ...errors(401, 403, 404) },
  }),
  dayBookings: createRoute({
    method: 'get',
    path: '/ranges/{rangeId}/bookings',
    tags: ['Console'],
    summary: "A day's bookings, from every source (staff)",
    security: bearer,
    request: { params: RangeIdParam, query: DateQuery },
    responses: {
      200: {
        description: "Bookings starting that local day, in time order, cancelled ones included",
        content: {
          'application/json': {
            schema: z
              .object({
                date: z.string(),
                bookings: z.array(BookingSchema.extend({ customerEmail: z.string().nullable() }).openapi('StaffBooking')),
              })
              .openapi('DayBookings'),
          },
        },
      },
      ...errors(400, 401, 403, 404),
    },
  }),
  dayOrders: createRoute({
    method: 'get',
    path: '/ranges/{rangeId}/orders',
    tags: ['Console'],
    summary: "A day's orders and takings (staff)",
    security: bearer,
    request: { params: RangeIdParam, query: DateQuery },
    responses: {
      200: {
        description: 'Orders made that local day, newest first, without ones still pending',
        content: {
          'application/json': {
            schema: z
              .object({
                date: z.string(),
                totals: z.object({ paidCents: Cents, refundedCents: Cents, orders: z.number().int() }),
                orders: z.array(
                  OrderSchema.extend({
                    bucketCode: BucketCodeSchema.nullable().openapi({ description: 'For a bucket order, its code and whether it was handed over' }),
                  }).openapi('StaffOrder'),
                ),
              })
              .openapi('DayOrders'),
          },
        },
      },
      ...errors(400, 401, 403, 404),
    },
  }),
  external: createRoute({
    method: 'post',
    path: '/ranges/{rangeId}/external-bookings',
    tags: ['Console'],
    summary: 'Record a booking taken by another system (staff)',
    description:
      'For bookings made at the counter, by phone, or on another booking platform. No payment is taken here. ' +
      'It blocks the bay like any booking, and a robot add-on becomes a hire with a signed key and link, the same as in the app.',
    security: bearer,
    request: {
      params: RangeIdParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                bayId: z.string().uuid(),
                startsAt: Instant,
                hours: z.number().int().min(1).max(MAX_HOURS).default(1),
                addOns: z.array(AddOnRequestSchema).max(3).default([]),
                externalRef: z.string().trim().min(1).max(100).openapi({ description: "The other system's booking id; unique per range" }),
                customerName: z.string().trim().min(1).max(100).optional(),
              })
              .openapi('ExternalBookingRequest'),
          },
        },
      },
    },
    responses: {
      201: { description: 'Recorded', content: { 'application/json': { schema: BookingSchema } } },
      ...errors(400, 401, 403, 404, 409, 422),
    },
  }),
};

export function consoleRoutes(app: Api, deps: Deps) {
  const { db } = deps;

  const staffRange = async (c: Parameters<typeof requireStaff>[0], rangeId: string) => {
    const range = await findRange(db, rangeId);
    await requireStaff(c, deps, range.id);
    return range;
  };
  const staffBay = async (c: Parameters<typeof requireStaff>[0], bayId: string) => {
    const bay = await findBay(db, bayId);
    await requireStaff(c, deps, bay.range_id);
    return bay;
  };
  const staffBayOut = (b: BayRow): z.infer<typeof StaffBaySchema> => ({
    id: b.id,
    rangeId: b.range_id,
    number: b.number,
    name: b.name,
    active: b.active,
    offPeakCentsPerHour: b.off_peak_cents,
    peakCentsPerHour: b.peak_cents,
    checkInCode: b.check_in_code,
    checkInUrl: `${deps.config.appUrl}/check-in/${b.check_in_code}`,
  });
  const dayBounds = (date: string | undefined, timeZone: string) => {
    const d = date ?? localDate(deps.now(), timeZone);
    if (!isCalendarDate(d)) throw badRequest('date must be YYYY-MM-DD.');
    return { date: d, from: zonedInstant(d, 0, timeZone), to: zonedInstant(addDays(d, 1), 0, timeZone) };
  };

  app.openapi(routes.updateRange, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const b = c.req.valid('json');
    await db.many(
      'update ranges set name = coalesce($2, name), off_peak_cents = coalesce($3, off_peak_cents), peak_cents = coalesce($4, peak_cents) where id = $1',
      [range.id, b.name ?? null, b.offPeakCentsPerHour ?? null, b.peakCentsPerHour ?? null],
    );
    return c.json(rangeOut(await loadRange(db, range.id)), 200);
  });

  app.openapi(routes.putHours, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const hours = c.req.valid('json').openingHours.map((h) => ({ weekday: h.weekday, opens: hhmmToMinutes(h.opens), closes: hhmmToMinutes(h.closes) }));
    if (new Set(hours.map((h) => h.weekday)).size !== hours.length) throw badRequest('Each weekday can appear once.');
    if (hours.some((h) => h.opens >= h.closes)) throw badRequest('Opening time must be before closing time.');
    await db.tx(async (tx) => {
      await tx.query('delete from opening_hours where range_id = $1', [range.id]);
      for (const h of hours) {
        await tx.query('insert into opening_hours (range_id, weekday, opens_min, closes_min) values ($1, $2, $3, $4)', [range.id, h.weekday, h.opens, h.closes]);
      }
    });
    return c.json(rangeOut(await loadRange(db, range.id)), 200);
  });

  app.openapi(routes.putPeaks, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const windows = c.req.valid('json').peakWindows.map((w) => ({ weekday: w.weekday, from: hhmmToMinutes(w.from), to: hhmmToMinutes(w.to) }));
    if (windows.some((w) => w.from >= w.to)) throw badRequest('A peak window must start before it ends.');
    await db.tx(async (tx) => {
      await tx.query('delete from peak_windows where range_id = $1', [range.id]);
      for (const w of windows) {
        await tx.query('insert into peak_windows (range_id, weekday, from_min, to_min) values ($1, $2, $3, $4)', [range.id, w.weekday, w.from, w.to]);
      }
    });
    return c.json(rangeOut(await loadRange(db, range.id)), 200);
  });

  app.openapi(routes.listBays, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const bays = await db.many<BayRow>('select * from bays where range_id = $1 order by number', [range.id]);
    return c.json({ bays: bays.map(staffBayOut) }, 200);
  });

  app.openapi(routes.createBay, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const b = c.req.valid('json');
    const bay = await db.maybeOne<BayRow>(
      `insert into bays (range_id, number, name, off_peak_cents, peak_cents) values ($1, $2, $3, $4, $5)
       on conflict (range_id, number) do nothing returning *`,
      [range.id, b.number, b.name ?? `Bay ${b.number}`, b.offPeakCentsPerHour ?? null, b.peakCentsPerHour ?? null],
    );
    if (!bay) throw conflict(`There is already a bay ${b.number}.`, 'duplicate_bay_number');
    return c.json(staffBayOut(bay), 201);
  });

  app.openapi(routes.updateBay, async (c) => {
    const bay = await staffBay(c, c.req.valid('param').bayId);
    const b = c.req.valid('json');
    const updated = await db.one<BayRow>(
      `update bays set
         name = coalesce($2, name),
         active = coalesce($3, active),
         off_peak_cents = case when $4 then $5::int else off_peak_cents end,
         peak_cents = case when $6 then $7::int else peak_cents end
       where id = $1 returning *`,
      [
        bay.id,
        b.name ?? null,
        b.active ?? null,
        b.offPeakCentsPerHour !== undefined,
        b.offPeakCentsPerHour ?? null,
        b.peakCentsPerHour !== undefined,
        b.peakCentsPerHour ?? null,
      ],
    );
    return c.json(staffBayOut(updated), 200);
  });

  app.openapi(routes.rotateCode, async (c) => {
    const bay = await staffBay(c, c.req.valid('param').bayId);
    const updated = await db.one<BayRow>('update bays set check_in_code = default where id = $1 returning *', [bay.id]);
    return c.json(staffBayOut(updated), 200);
  });

  app.openapi(routes.dayBookings, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const { date, from, to } = dayBounds(c.req.valid('query').date, range.time_zone);
    const rows = await db.many<BookingRow & { email: string | null }>(
      `select b.*, a.email from bookings b left join accounts a on a.id = b.account_id
       where b.range_id = $1 and b.starts_at >= $2 and b.starts_at < $3 and b.status <> 'pending_payment'
       order by b.starts_at, b.created_at`,
      [range.id, from, to],
    );
    const bookings = await Promise.all(rows.map(async (b) => ({ ...(await bookingOut(deps, b)), customerEmail: b.email })));
    return c.json({ date, bookings }, 200);
  });

  app.openapi(routes.dayOrders, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const { date, from, to } = dayBounds(c.req.valid('query').date, range.time_zone);
    const rows = await db.many<OrderRow>(
      `select * from orders where range_id = $1 and created_at >= $2 and created_at < $3 and status <> 'pending'
       order by created_at desc`,
      [range.id, from, to],
    );
    const sum = (status: string) => rows.filter((o) => o.status === status).reduce((n, o) => n + o.total_cents, 0);
    return c.json(
      {
        date,
        totals: { paidCents: sum('paid'), refundedCents: sum('refunded'), orders: rows.length },
        orders: await Promise.all(
          rows.map(async (o) => {
            const code = o.kind === 'bucket' ? await db.maybeOne<BucketCodeRow>('select * from bucket_codes where order_id = $1', [o.id]) : undefined;
            return { ...(await orderOut(deps, o)), bucketCode: code ? bucketCodeOut(code) : null };
          }),
        ),
      },
      200,
    );
  });

  app.openapi(routes.external, async (c) => {
    const range = await staffRange(c, c.req.valid('param').rangeId);
    const b = c.req.valid('json');
    const bay = await findBay(db, b.bayId);
    if (bay.range_id !== range.id) throw notFound('No such bay at this range.');
    const booking = await createBooking(deps, {
      bayId: bay.id,
      startsAt: new Date(b.startsAt),
      hours: b.hours,
      addOns: b.addOns,
      accountId: null,
      source: 'external',
      externalRef: b.externalRef,
      customerName: b.customerName,
    });
    return c.json(await bookingOut(deps, booking), 201);
  });
}

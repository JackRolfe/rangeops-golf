import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { Api } from '../app.js';
import { isStaff, requireAccount, type AccountRow } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { errors, notFound, unprocessable } from '../errors.js';
import { PaymentMethod } from '../orders/service.js';
import { Instant } from '../ranges/schemas.js';
import { AddOnRequestSchema, BookingIdParam, BookingSchema, bookingOut } from './schemas.js';
import { cancelBooking, createBooking, MAX_HOURS, type BookingRow } from './service.js';

const create = createRoute({
  method: 'post',
  path: '/bookings',
  tags: ['Bookings'],
  summary: 'Book a bay, with a robot, clubs or a lesson, and pay',
  description:
    'Whole hours, starting on the hour, inside opening hours. A robot add-on assigns a free robot to the bay and ' +
    'returns a signed hire key for the booked hours. A declined payment answers 402 and books nothing.',
  security: bearer,
  request: {
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
              paymentMethod: PaymentMethod.optional().openapi({ description: 'Needed unless the total is zero' }),
            })
            .openapi('BookingRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Booked and paid', content: { 'application/json': { schema: BookingSchema } } },
    ...errors(400, 401, 402, 404, 409, 422),
  },
});

const mine = createRoute({
  method: 'get',
  path: '/me/bookings',
  tags: ['Bookings'],
  summary: 'Your bookings at every range, newest first',
  security: bearer,
  responses: {
    200: { description: 'Bookings', content: { 'application/json': { schema: z.object({ bookings: z.array(BookingSchema) }) } } },
    ...errors(401),
  },
});

const getOne = createRoute({
  method: 'get',
  path: '/bookings/{bookingId}',
  tags: ['Bookings'],
  summary: 'One booking (its owner, or staff at its range)',
  security: bearer,
  request: { params: BookingIdParam },
  responses: {
    200: { description: 'The booking', content: { 'application/json': { schema: BookingSchema } } },
    ...errors(401, 404),
  },
});

const cancel = createRoute({
  method: 'post',
  path: '/bookings/{bookingId}/cancel',
  tags: ['Bookings'],
  summary: 'Cancel a booking and refund it',
  description:
    'Its owner can cancel before it starts; range staff at any time. The robot hire is cancelled too, but a hire key ' +
    'already on a phone stays valid until its end, because robots check keys offline.',
  security: bearer,
  request: { params: BookingIdParam },
  responses: {
    200: { description: 'Cancelled and refunded', content: { 'application/json': { schema: BookingSchema } } },
    ...errors(401, 404, 409, 422),
  },
});

/** A booking the signed-in account may see: its own, or any at a range it is staff at. Otherwise 404. */
export async function visibleBooking(c: Context, deps: Deps, bookingId: string) {
  const account = await requireAccount(c, deps);
  const booking = await deps.db.maybeOne<BookingRow>('select * from bookings where id = $1', [bookingId]);
  if (!booking) throw notFound('No such booking.');
  const owner = booking.account_id === account.id;
  const staff = await isStaff(deps, account.id, booking.range_id);
  if (!owner && !staff) throw notFound('No such booking.');
  return { account, booking, owner, staff } as { account: AccountRow; booking: BookingRow; owner: boolean; staff: boolean };
}

export function bookingRoutes(app: Api, deps: Deps) {
  app.openapi(create, async (c) => {
    const account = await requireAccount(c, deps);
    const body = c.req.valid('json');
    const booking = await createBooking(deps, {
      bayId: body.bayId,
      startsAt: new Date(body.startsAt),
      hours: body.hours,
      addOns: body.addOns,
      accountId: account.id,
      source: 'rangeops',
      paymentMethod: body.paymentMethod,
    });
    return c.json(await bookingOut(deps, booking), 201);
  });

  app.openapi(mine, async (c) => {
    const account = await requireAccount(c, deps);
    const rows = await deps.db.many<BookingRow>(
      'select * from bookings where account_id = $1 order by starts_at desc',
      [account.id],
    );
    return c.json({ bookings: await Promise.all(rows.map((b) => bookingOut(deps, b))) }, 200);
  });

  app.openapi(getOne, async (c) => {
    const { booking } = await visibleBooking(c, deps, c.req.valid('param').bookingId);
    return c.json(await bookingOut(deps, booking), 200);
  });

  app.openapi(cancel, async (c) => {
    const { booking, staff } = await visibleBooking(c, deps, c.req.valid('param').bookingId);
    if (!staff && booking.starts_at.getTime() <= deps.now().getTime()) {
      throw unprocessable('This booking has started. Ask the range to cancel it.', 'already_started');
    }
    return c.json(await bookingOut(deps, await cancelBooking(deps, booking)), 200);
  });
}

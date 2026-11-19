import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireAccount } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import { BookingSchema, bookingOut } from '../bookings/schemas.js';
import type { BookingRow } from '../bookings/service.js';
import type { Deps } from '../deps.js';
import { errors, notFound } from '../errors.js';
import type { BayRow } from '../ranges/repo.js';
import { Instant } from '../ranges/schemas.js';

/** How early a booking can be checked in. The hire key still starts at the booked time. */
export const EARLY_CHECK_IN_MINUTES = 15;

const checkIn = createRoute({
  method: 'post',
  path: '/check-in/{code}',
  tags: ['Bookings'],
  summary: "Check in at a bay by scanning its QR code",
  description:
    `The QR code at each bay opens APP_URL/check-in/<code>; the app posts that code here. Finds your confirmed booking at ` +
    `that bay that is running now or starts within ${EARLY_CHECK_IN_MINUTES} minutes, marks it checked in, and returns ` +
    'the hire link if a robot was hired. Checking in again is harmless and keeps the first time.',
  security: bearer,
  request: {
    params: z.object({ code: z.string().min(1).openapi({ param: { name: 'code', in: 'path' }, description: "The bay's check-in code" }) }),
  },
  responses: {
    200: {
      description: 'Checked in',
      content: {
        'application/json': {
          schema: z
            .object({
              checkedInAt: Instant,
              bay: z.object({ id: z.string().uuid(), number: z.number().int(), name: z.string() }),
              booking: BookingSchema,
              hireLink: z.string().url().nullable().openapi({ description: 'Opens the Drive tab with the hire key, if a robot was hired' }),
            })
            .openapi('CheckIn'),
        },
      },
    },
    ...errors(401, 404),
  },
});

export function checkInRoutes(app: Api, deps: Deps) {
  app.openapi(checkIn, async (c) => {
    const account = await requireAccount(c, deps);
    const bay = await deps.db.maybeOne<BayRow>('select * from bays where check_in_code = $1', [c.req.valid('param').code]);
    if (!bay) throw notFound("That QR code isn't a RangeOps bay.", 'unknown_code');
    const now = deps.now();
    const soon = new Date(now.getTime() + EARLY_CHECK_IN_MINUTES * 60_000);
    const booking = await deps.db.maybeOne<BookingRow>(
      `update bookings set checked_in_at = coalesce(checked_in_at, $4)
       where id = (
         select id from bookings
         where account_id = $1 and bay_id = $2 and status = 'confirmed' and starts_at <= $3 and ends_at > $4
         order by starts_at limit 1)
       returning *`,
      [account.id, bay.id, soon, now],
    );
    if (!booking) {
      throw notFound(`You have no booking at ${bay.name} right now. Check-in opens ${EARLY_CHECK_IN_MINUTES} minutes before.`, 'no_booking');
    }
    const out = await bookingOut(deps, booking);
    return c.json(
      {
        checkedInAt: booking.checked_in_at!.toISOString(),
        bay: { id: bay.id, number: bay.number, name: bay.name },
        booking: out,
        hireLink: out.hire?.link ?? null,
      },
      200,
    );
  });
}

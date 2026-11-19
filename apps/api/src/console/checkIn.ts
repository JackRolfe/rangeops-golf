import { createRoute } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import { BookingIdParam, BookingSchema, bookingOut } from '../bookings/schemas.js';
import type { BookingRow } from '../bookings/service.js';
import type { Deps } from '../deps.js';
import { conflict, errors, notFound } from '../errors.js';

const staffCheckIn = createRoute({
  method: 'post',
  path: '/bookings/{bookingId}/check-in',
  tags: ['Console'],
  summary: 'Check a player in at the counter (staff)',
  description:
    "For players who can't scan the bay's QR code. Marks the booking checked in now. Refused for a cancelled booking " +
    'or one already checked in, so the console can say so.',
  security: bearer,
  request: { params: BookingIdParam },
  responses: {
    200: { description: 'Checked in', content: { 'application/json': { schema: BookingSchema } } },
    ...errors(401, 403, 404, 409),
  },
});

export function staffCheckInRoutes(app: Api, deps: Deps) {
  app.openapi(staffCheckIn, async (c) => {
    const { bookingId } = c.req.valid('param');
    const booking = await deps.db.maybeOne<BookingRow>('select * from bookings where id = $1', [bookingId]);
    if (!booking) throw notFound('No such booking.');
    await requireStaff(c, deps, booking.range_id);
    if (booking.status === 'cancelled') throw conflict('This booking is cancelled.', 'cancelled');
    if (booking.status !== 'confirmed') throw conflict('This booking is not paid yet.', 'not_confirmed');
    if (booking.checked_in_at) throw conflict('This booking is already checked in.', 'already_checked_in');
    const updated = await deps.db.one<BookingRow>(
      'update bookings set checked_in_at = $2 where id = $1 and checked_in_at is null returning *',
      [booking.id, deps.now()],
    );
    return c.json(await bookingOut(deps, updated), 200);
  });
}

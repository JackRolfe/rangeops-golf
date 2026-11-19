import type { Deps } from '../deps.js';
import { conflict, paymentDeclined, unprocessable } from '../errors.js';
import { chargeOrder, createOrder, markPaid, refundOrder, type OrderLineRow, type OrderRow } from '../orders/service.js';
import { hourSlot } from '../pricing.js';
import { findBay, loadRange, type AddOnKind } from '../ranges/repo.js';
import { HOUR_MS, localHhmm } from '../time.js';

export interface BookingRow {
  id: string;
  range_id: string;
  bay_id: string;
  account_id: string | null;
  source: 'rangeops' | 'external';
  external_ref: string | null;
  customer_name: string | null;
  starts_at: Date;
  ends_at: Date;
  status: 'pending_payment' | 'confirmed' | 'cancelled';
  order_id: string | null;
  checked_in_at: Date | null;
  created_at: Date;
  cancelled_at: Date | null;
}

export interface AddOnRequest {
  kind: AddOnKind;
  quantity?: number;
}

export interface BookingRequest {
  bayId: string;
  startsAt: Date;
  hours: number;
  addOns: AddOnRequest[];
  accountId: string | null;
  source: 'rangeops' | 'external';
  externalRef?: string;
  customerName?: string;
  /** Required for `rangeops` bookings with a non-zero total. */
  paymentMethod?: string;
}

export const MAX_HOURS = 4;
const MAX_QUANTITY: Record<AddOnKind, number> = { robot: 1, club_hire: 4, lesson: 1 };
const ADDON_NAMES: Record<AddOnKind, string> = { robot: 'Mulligan robot hire', club_hire: 'Club hire', lesson: 'Lesson' };

/** Checks the rules and prices the booking, without writing anything. */
export async function quoteBooking(deps: Deps, req: BookingRequest) {
  const bay = await findBay(deps.db, req.bayId);
  const data = await loadRange(deps.db, bay.range_id);
  if (!bay.active) throw unprocessable(`${bay.name} is not taking bookings.`, 'bay_inactive');

  const slots = Array.from({ length: req.hours }, (_, i) => hourSlot(data, bay, new Date(req.startsAt.getTime() + i * HOUR_MS)));
  if (!slots[0]!.onTheHour) throw unprocessable('Bookings start on the hour.', 'not_on_the_hour');
  if (req.startsAt.getTime() < deps.now().getTime()) throw unprocessable('That time has passed.', 'in_the_past');
  const closed = slots.find((s) => !s.open);
  if (closed) {
    throw unprocessable(`The range is closed at ${localHhmm(closed.startsAt, data.range.time_zone)} that day.`, 'outside_opening_hours');
  }

  const seen = new Set<AddOnKind>();
  const addOns: { kind: AddOnKind; quantity: number; totalCents: number; line: OrderLineRow }[] = [];
  for (const a of req.addOns) {
    if (seen.has(a.kind)) throw unprocessable(`Add-on ${a.kind} is listed twice.`, 'duplicate_add_on');
    seen.add(a.kind);
    const quantity = a.quantity ?? 1;
    if (quantity < 1 || quantity > MAX_QUANTITY[a.kind]) {
      throw unprocessable(`Add-on ${a.kind} can have a quantity of 1 to ${MAX_QUANTITY[a.kind]}.`, 'bad_quantity');
    }
    const price = data.addOns.find((p) => p.kind === a.kind);
    if (!price) throw unprocessable(`This range doesn't offer ${a.kind}.`, 'add_on_unavailable');
    const units = price.unit === 'per_hour' ? quantity * req.hours : quantity;
    addOns.push({
      kind: a.kind,
      quantity,
      totalCents: units * price.cents,
      line: { description: ADDON_NAMES[a.kind] + (price.unit === 'per_hour' ? ', per hour' : ''), quantity: units, unit_cents: price.cents },
    });
  }

  const tz = data.range.time_zone;
  const lines: OrderLineRow[] = slots.map((s) => ({
    description: `${bay.name}, ${localHhmm(s.startsAt, tz)} ${s.peak ? 'peak' : 'off-peak'}`,
    quantity: 1,
    unit_cents: s.priceCents,
  }));
  lines.push(...addOns.map((a) => a.line));
  return { data, bay, slots, addOns, lines };
}

function isExclusionViolation(err: unknown, constraint: string) {
  const e = err as { code?: string; constraint?: string; message?: string };
  return e?.code === '23P01' && (e.constraint === constraint || !!e.message?.includes(constraint));
}

/**
 * Books a bay. For `rangeops` bookings it charges the payment method; for
 * `external` ones the money was taken elsewhere.
 */
export async function createBooking(deps: Deps, req: BookingRequest): Promise<BookingRow> {
  const { data, bay, addOns, lines } = await quoteBooking(deps, req);
  const endsAt = new Date(req.startsAt.getTime() + req.hours * HOUR_MS);

  let booking: BookingRow;
  let order: OrderRow;
  try {
    ({ booking, order } = await deps.db.tx(async (tx) => {
      const order = await createOrder(
        deps,
        { accountId: req.accountId, rangeId: data.range.id, kind: 'booking', currency: data.range.currency, lines },
        tx,
      );
      const booking = await deps.db.one<BookingRow>(
        `insert into bookings (range_id, bay_id, account_id, source, external_ref, customer_name, starts_at, ends_at, status, order_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment', $9, $10) returning *`,
        [data.range.id, bay.id, req.accountId, req.source, req.externalRef ?? null, req.customerName ?? null, req.startsAt, endsAt, order.id, deps.now()],
        tx,
      );
      for (const a of addOns) {
        await deps.db.many('insert into booking_addons (booking_id, kind, quantity, total_cents) values ($1, $2, $3, $4)', [booking.id, a.kind, a.quantity, a.totalCents], tx);
      }
      return { booking, order };
    }));
  } catch (err) {
    if (isExclusionViolation(err, 'bookings_no_overlap')) throw conflict(`${bay.name} is already booked for some of that time.`, 'bay_taken');
    const e = err as { code?: string; message?: string };
    if (e?.code === '23505' && e.message?.includes('bookings_external_ref')) throw conflict('A booking with that external reference exists.', 'duplicate_external_ref');
    throw err;
  }

  const paid =
    req.source === 'external'
      ? await markPaid(deps, order.id, 'external')
      : await chargeOrder(deps, order, req.paymentMethod, `${data.range.name}: ${bay.name}`);

  if (paid.status !== 'paid') {
    await setCancelled(deps, booking.id);
    throw paymentDeclined(paid.failure_reason ?? 'The payment did not go through.');
  }

  booking = await deps.db.one<BookingRow>("update bookings set status = 'confirmed' where id = $1 returning *", [booking.id]);
  return booking;
}

function setCancelled(deps: Deps, bookingId: string) {
  return deps.db.one<BookingRow>(
    "update bookings set status = 'cancelled', cancelled_at = $2 where id = $1 returning *",
    [bookingId, deps.now()],
  );
}

/** Cancels a confirmed booking and refunds its order. */
export async function cancelBooking(deps: Deps, booking: BookingRow): Promise<BookingRow> {
  if (booking.status === 'cancelled') throw conflict('That booking is already cancelled.', 'already_cancelled');
  const cancelled = await setCancelled(deps, booking.id);
  if (booking.order_id) {
    const order = await deps.db.one<OrderRow>('select * from orders where id = $1', [booking.order_id]);
    await refundOrder(deps, order);
  }
  return cancelled;
}

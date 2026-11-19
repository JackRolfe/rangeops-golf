import { quoteBooking, validateOpeningHours, validatePrices } from '../domain/pricing';
import { toIsoDate, toLocalDateTime, dateOf } from '../domain/time';
import type { Booking, IsoDate, Order, Pass, Payment, RangeSetup, Result, Robot } from '../domain/types';
import type { Clock, ConsoleApi } from './ConsoleApi';
import { seedDemoRange } from './seed';

/** Everything the fake holds. Exported so tests can build a store by hand. */
export interface FakeState {
  setup: RangeSetup;
  bookings: Booking[];
  orders: Order[];
  passes: Pass[];
  payments: Payment[];
  robots: Robot[];
  nextId: number;
}

/**
 * An in-memory ConsoleApi, seeded with a demo range. It stands in for the backend until ticket 11
 * points the console at apps/api. It enforces the same rules the backend should, using the same
 * domain functions, so the screens see realistic refusals.
 */
export class FakeConsoleApi implements ConsoleApi {
  protected state: FakeState;
  protected readonly clock: Clock;

  constructor(options: { clock?: Clock; state?: FakeState } = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.state = options.state ?? seedDemoRange(this.clock());
  }

  protected now() {
    return toLocalDateTime(this.clock());
  }

  protected today() {
    return toIsoDate(this.clock());
  }

  protected id(prefix: string) {
    this.state.nextId += 1;
    return `${prefix}-${this.state.nextId}`;
  }

  async getSetup(): Promise<RangeSetup> {
    return copy(this.state.setup);
  }

  async saveSetup(setup: RangeSetup): Promise<Result<RangeSetup>> {
    const errors = [...validateOpeningHours(setup.openingHours), ...validatePrices(setup.prices, setup.openingHours)];
    if (errors.length) return { ok: false, errors };
    this.state.setup = copy(setup);
    return { ok: true, value: copy(setup) };
  }

  async listBookings(date: IsoDate): Promise<Booking[]> {
    const bayNumber = new Map(this.state.setup.bays.map((b) => [b.id, b.number]));
    return copy(
      this.state.bookings
        .filter((b) => b.date === date)
        .sort((a, b) => a.start - b.start || (bayNumber.get(a.bayId) ?? 0) - (bayNumber.get(b.bayId) ?? 0)),
    );
  }

  async setBookingStatus(bookingId: string, status: 'checked-in' | 'cancelled'): Promise<Result<Booking>> {
    const booking = this.state.bookings.find((b) => b.id === bookingId);
    if (!booking) return { ok: false, errors: ['No such booking.'] };
    if (booking.status !== 'booked') {
      return { ok: false, errors: [`This booking is already ${booking.status === 'cancelled' ? 'cancelled' : 'checked in'}.`] };
    }
    booking.status = status;
    if (status === 'cancelled') {
      const at = this.now();
      for (const paid of this.state.payments.filter((p) => p.ref === booking.id && p.amount > 0)) {
        this.state.payments.push({ id: this.id('pay'), at, kind: paid.kind, amount: -paid.amount, ref: booking.id });
      }
    }
    return { ok: true, value: copy(booking) };
  }

  async listOrders(date: IsoDate): Promise<Order[]> {
    return copy(this.state.orders.filter((o) => dateOf(o.paidAt) === date).sort((a, b) => b.paidAt.localeCompare(a.paidAt)));
  }

  async listPasses(): Promise<Pass[]> {
    return copy([...this.state.passes].sort((a, b) => b.soldAt.localeCompare(a.soldAt)));
  }

  async listRobots(): Promise<Robot[]> {
    return copy(this.state.robots);
  }

  async listPayments(date: IsoDate): Promise<Payment[]> {
    return copy(this.state.payments.filter((p) => dateOf(p.at) === date).sort((a, b) => a.at.localeCompare(b.at)));
  }

  /** Price a booking the way the backend would. Used by the seed and by tests. */
  quote(bayId: string, date: IsoDate, start: number, hours: number, robotHire: boolean) {
    const bay = this.state.setup.bays.find((b) => b.id === bayId);
    if (!bay) return { ok: false as const, errors: ['No such bay.'] };
    const { prices, openingHours } = this.state.setup;
    return quoteBooking({ prices, openingHours, bay, date, start, hours, robotHire });
  }
}

export function copy<T>(value: T): T {
  return structuredClone(value);
}

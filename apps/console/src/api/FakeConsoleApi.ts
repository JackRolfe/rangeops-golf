import { generateCode, handOver, type HandoverResult } from '../domain/buckets';
import { advanceRobot, assignHires } from '../domain/fleet';
import { newPass, redeemBucket } from '../domain/passes';
import { quoteBooking } from '../domain/pricing';
import { validateSetup } from '../domain/setup';
import { dateOf, hourOf, toIsoDate, toLocalDateTime } from '../domain/time';
import type { Booking, IsoDate, Order, Pass, PassKind, Payment, RangeSetup, Result, Robot } from '../domain/types';
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
    const errors = validateSetup(setup);
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

  async handOverBucket(code: string): Promise<HandoverResult> {
    const result = handOver(code, this.state.orders, this.now());
    if (result.outcome === 'handed-over') {
      this.state.orders = this.state.orders.map((o) => (o.id === result.order.id ? result.order : o));
    }
    return copy(result);
  }

  async listPasses(): Promise<Pass[]> {
    return copy([...this.state.passes].sort((a, b) => b.soldAt.localeCompare(a.soldAt)));
  }

  async sellPass(player: string, kind: PassKind): Promise<Result<Pass>> {
    const at = this.now();
    const result = newPass(this.id('pass'), player, kind, this.state.setup.prices, at);
    if (!result.ok) return result;
    const { pass, price } = result.value;
    this.state.passes.push(pass);
    this.state.payments.push({ id: this.id('pay'), at, kind: 'pass', amount: price, ref: pass.id });
    return { ok: true, value: copy(pass) };
  }

  async redeemPassBucket(passId: string): Promise<Result<{ pass: Pass; order: Order }>> {
    const index = this.state.passes.findIndex((p) => p.id === passId);
    if (index < 0) return { ok: false, errors: ['No such pass.'] };
    const at = this.now();
    const result = redeemBucket(this.state.passes[index], at);
    if (!result.ok) return result;
    this.state.passes[index] = result.value;
    // A pass bucket is a medium bucket, handed over on the spot, with nothing to pay.
    const order: Order = {
      id: this.id('ord'),
      code: generateCode(Math.random, new Set(this.state.orders.map((o) => o.code))),
      bucket: 'medium',
      status: 'handed-over',
      source: 'counter',
      amount: 0,
      paidAt: at,
      handedOverAt: at,
      passId,
    };
    this.state.orders.push(order);
    return { ok: true, value: copy({ pass: result.value, order }) };
  }

  async listRobots(): Promise<Robot[]> {
    // Move the fleet on to now: hired robots drain, docked ones charge, ended hires come home,
    // and checked-in bookings that hired a robot get one.
    const now = this.now();
    const advanced = this.state.robots.map((r) => advanceRobot(r, now));
    this.state.robots = assignHires(advanced, this.state.bookings, now, hourOf(now));
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

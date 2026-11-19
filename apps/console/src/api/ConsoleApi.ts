// The one boundary between the console's screens and wherever range data lives.
// Today: FakeConsoleApi (in memory). Later: an HTTP adapter for apps/api, or a partner's portal.
// Every method is async and returns copies, so screens never hold live references into the store.
import type { HandoverResult } from '../domain/buckets';
import type { Booking, IsoDate, Order, Pass, Payment, RangeSetup, Result, Robot } from '../domain/types';

export type Clock = () => Date;

export interface ConsoleApi {
  /** The range, its bays, opening hours and price list. */
  getSetup(): Promise<RangeSetup>;
  /** Replaces the setup. Refused, with reasons, if it doesn't validate. */
  saveSetup(setup: RangeSetup): Promise<Result<RangeSetup>>;

  /** Bookings on a day, in start order then bay order. */
  listBookings(date: IsoDate): Promise<Booking[]>;
  /** Check a player in, or cancel (which refunds what they paid). */
  setBookingStatus(bookingId: string, status: 'checked-in' | 'cancelled'): Promise<Result<Booking>>;

  /** Bucket orders paid on a day, newest first. */
  listOrders(date: IsoDate): Promise<Order[]>;
  /** Hand over the bucket for a code, at most once. Says why not when it can't. */
  handOverBucket(code: string): Promise<HandoverResult>;

  /** Every pass, newest first. */
  listPasses(): Promise<Pass[]>;

  /** The fleet: every robot with its latest telemetry and hire. */
  listRobots(): Promise<Robot[]>;

  /** Money taken on a day, including refunds as negative amounts. */
  listPayments(date: IsoDate): Promise<Payment[]>;
}

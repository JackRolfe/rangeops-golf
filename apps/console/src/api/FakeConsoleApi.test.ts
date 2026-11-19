import { describe, expect, it } from 'vitest';
import { toIsoDate } from '../domain/time';
import { FakeConsoleApi } from './FakeConsoleApi';
import { consoleApiContract } from './consoleApi.contract';
import { DEMO_CODES } from './seed';

// A Thursday afternoon, inside opening hours and the peak window.
const at = (iso: string) => () => new Date(iso);
const THURSDAY_5PM = at('2026-11-19T17:10:00');

consoleApiContract('FakeConsoleApi', () => {
  const clock = THURSDAY_5PM;
  return { api: new FakeConsoleApi({ clock }), clock };
});

describe('the demo range', () => {
  it('has twenty bays and three robots', async () => {
    const api = new FakeConsoleApi({ clock: THURSDAY_5PM });
    expect((await api.getSetup()).bays).toHaveLength(20);
    expect(await api.listRobots()).toHaveLength(3);
  });

  it('is the same on every load of the same day', async () => {
    const a = await new FakeConsoleApi({ clock: THURSDAY_5PM }).listBookings('2026-11-19');
    const b = await new FakeConsoleApi({ clock: at('2026-11-19T17:12:00') }).listBookings('2026-11-19');
    expect(a.map((x) => [x.bayId, x.start, x.player])).toEqual(b.map((x) => [x.bayId, x.start, x.player]));
  });

  it('has robots out on hire while the range is open', async () => {
    const robots = await new FakeConsoleApi({ clock: THURSDAY_5PM }).listRobots();
    expect(robots.filter((r) => r.hire).length).toBeGreaterThanOrEqual(2);
  });

  it('takes no money in the future', async () => {
    const clock = THURSDAY_5PM;
    const payments = await new FakeConsoleApi({ clock }).listPayments(toIsoDate(clock()));
    expect(payments.length).toBeGreaterThan(10);
    expect(payments.every((p) => p.at <= '2026-11-19T17:10')).toBe(true);
  });

  it('prices every booking by the price list', async () => {
    const api = new FakeConsoleApi({ clock: THURSDAY_5PM });
    for (const booking of await api.listBookings('2026-11-19')) {
      const quote = api.quote(booking.bayId, booking.date, booking.start, booking.hours, booking.robotHire);
      expect(quote.ok && quote.value.total).toBe(booking.amount);
    }
  });

  it('has the demo codes', async () => {
    const orders = await new FakeConsoleApi({ clock: THURSDAY_5PM }).listOrders('2026-11-19');
    const codes = new Map(orders.map((o) => [o.code, o.status]));
    expect(codes.get(DEMO_CODES.paid)).toBe('paid');
    expect(codes.get(DEMO_CODES.handedOver)).toBe('handed-over');
    expect(codes.get(DEMO_CODES.refunded)).toBe('refunded');
  });

  it('seeds early in the morning without failing', async () => {
    const api = new FakeConsoleApi({ clock: at('2026-11-22T05:30:00') });
    expect((await api.listOrders('2026-11-22')).length).toBeGreaterThan(0);
    expect((await api.listRobots()).every((r) => !r.hire)).toBe(true);
  });
});

describe('the demo data', () => {
  it('uses only well-formed bucket codes', async () => {
    const { isWellFormedCode } = await import('../domain/buckets');
    const orders = await new FakeConsoleApi({ clock: THURSDAY_5PM }).listOrders('2026-11-19');
    expect(orders.filter((o) => !isWellFormedCode(o.code))).toEqual([]);
  });
});

describe('the fake fleet', () => {
  it('drains hired robots as its clock moves', async () => {
    let now = new Date('2026-11-19T17:10:00');
    const api = new FakeConsoleApi({ clock: () => now });
    const before = (await api.listRobots()).find((r) => r.hire)!;
    now = new Date('2026-11-19T17:30:00');
    const after = (await api.listRobots()).find((r) => r.id === before.id)!;
    expect(after.battery).toBe(before.battery! - 10);
  });

  it('sends a robot when staff check in a booking that hired one', async () => {
    let now = new Date('2026-11-19T17:10:00');
    const api = new FakeConsoleApi({ clock: () => now });
    // Bring every robot home by the end of the day, then check in a fresh evening booking with a robot.
    now = new Date('2026-11-19T21:05:00');
    await api.listRobots();
    const evening = (await api.listBookings('2026-11-19')).find((b) => b.start === 21 && b.status === 'booked');
    expect(evening).toBeDefined();
    if (!evening) return;
    (api as unknown as { state: { bookings: { id: string; robotHire: boolean }[] } }).state.bookings.find((b) => b.id === evening.id)!.robotHire = true;
    await api.setBookingStatus(evening.id, 'checked-in');
    const robots = await api.listRobots();
    expect(robots.some((r) => r.hire?.bookingId === evening.id)).toBe(true);
  });
});

describe('the demo takings', () => {
  it('look like a day at a 20-bay range, not a week', async () => {
    const { takings } = await import('../domain/takings');
    const t = takings(await new FakeConsoleApi({ clock: THURSDAY_5PM }).listPayments('2026-11-19'));
    expect(t.total).toBeGreaterThan(1000_00);
    expect(t.total).toBeLessThan(6000_00);
  });
});

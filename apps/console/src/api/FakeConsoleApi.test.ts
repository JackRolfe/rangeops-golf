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

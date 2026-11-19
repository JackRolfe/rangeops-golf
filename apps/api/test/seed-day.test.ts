import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemoDay } from '../src/db/seedDay.js';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let staff: string;
beforeEach(async () => {
  t = await makeTestApp();
  t.clock.set('2026-11-24T06:30:00Z'); // Tue 24 Nov 2026, 17:30 in Sydney
  staff = await t.signIn('staff@rangeops.test');
});
afterEach(() => t.close());

describe('seedDemoDay', () => {
  it('fills today with bookings, check-ins, robot hires, bucket orders and passes', async () => {
    const seeded = await seedDemoDay(t.deps);
    expect(seeded.bookings).toBeGreaterThan(10);
    expect(seeded.buckets).toBeGreaterThan(5);

    const day = (await t.call('GET', '/ranges/demo/bookings', { token: staff })).body.bookings;
    expect(day.length).toBe(seeded.bookings);
    expect(day.some((b: any) => b.source === 'external')).toBe(true);
    expect(day.some((b: any) => b.checkedInAt)).toBe(true);
    expect(day.some((b: any) => b.hire)).toBe(true);
    expect(day.every((b: any) => !b.checkedInAt || b.startsAt <= '2026-11-24T06:30:00.000Z')).toBe(true);

    const orders = (await t.call('GET', '/ranges/demo/orders', { token: staff })).body.orders;
    const codes = orders.filter((o: any) => o.bucketCode);
    expect(codes.some((o: any) => o.bucketCode.redeemedAt)).toBe(true);
    expect(codes.some((o: any) => !o.bucketCode.redeemedAt)).toBe(true);

    const passes = (await t.call('GET', '/ranges/demo/passes', { token: staff })).body;
    expect(passes.passes).toHaveLength(1);
    expect(passes.ballCredit).toHaveLength(1);

    const fleet = (await t.call('GET', '/ranges/demo/fleet', { token: staff })).body.robots;
    expect(fleet.every((r: any) => r.status.state)).toBe(true);
  });

  it('does nothing on a day that already has bookings', async () => {
    await seedDemoDay(t.deps);
    expect(await seedDemoDay(t.deps)).toEqual({ bookings: 0, buckets: 0 });
  });

  it('leaves the real clock alone', async () => {
    await seedDemoDay(t.deps);
    expect(t.deps.now().toISOString()).toBe('2026-11-24T06:30:00.000Z');
  });
});

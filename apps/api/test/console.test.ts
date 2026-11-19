import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let staff: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  token = await t.signIn('parent@example.com');
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
});
afterEach(() => t.close());

const FOUR_PM = '2026-11-24T05:00:00.000Z';
const day = async () => (await t.call('GET', '/ranges/demo/availability?date=2026-11-24')).body;

describe('console set-up', () => {
  it('changes range prices, and availability follows', async () => {
    const res = await t.call('PATCH', '/ranges/demo', { token: staff, body: { offPeakCentsPerHour: 2000, peakCentsPerHour: 3200 } });
    expect(res.status).toBe(200);
    expect(res.body.prices).toEqual({ offPeakCentsPerHour: 2000, peakCentsPerHour: 3200 });
    const slots = (await day()).bays[0].slots;
    expect(slots.find((s: any) => s.localTime === '10:00').priceCents).toBe(2000);
    expect(slots.find((s: any) => s.localTime === '16:00').priceCents).toBe(3200);
  });

  it('replaces opening hours and peak windows', async () => {
    const hours = await t.call('PUT', '/ranges/demo/hours', {
      token: staff,
      body: { openingHours: [{ weekday: 2, opens: '10:00', closes: '14:00' }] },
    });
    expect(hours.body.openingHours).toEqual([{ weekday: 2, opens: '10:00', closes: '14:00' }]);
    expect((await day()).bays[0].slots.map((s: any) => s.localTime)).toEqual(['10:00', '11:00', '12:00', '13:00']);
    expect((await t.call('GET', '/ranges/demo/availability?date=2026-11-25')).body.bays[0].slots).toEqual([]);

    const peaks = await t.call('PUT', '/ranges/demo/peak-windows', { token: staff, body: { peakWindows: [{ weekday: 2, from: '12:00', to: '13:00' }] } });
    expect(peaks.body.peakWindows).toEqual([{ weekday: 2, from: '12:00', to: '13:00' }]);
    expect((await day()).bays[0].slots.filter((s: any) => s.peak).map((s: any) => s.localTime)).toEqual(['12:00']);

    const bad = await t.call('PUT', '/ranges/demo/hours', { token: staff, body: { openingHours: [{ weekday: 2, opens: '14:00', closes: '10:00' }] } });
    expect(bad.status).toBe(400);
    const dup = await t.call('PUT', '/ranges/demo/hours', {
      token: staff,
      body: { openingHours: [{ weekday: 2, opens: '10:00', closes: '14:00' }, { weekday: 2, opens: '15:00', closes: '16:00' }] },
    });
    expect(dup.status).toBe(400);
    expect((await t.call('PUT', '/ranges/demo/hours', { token: staff, body: { openingHours: [{ weekday: 2, opens: '25:00', closes: '26:00' }] } })).status).toBe(400);
  });

  it('adds bays with numbers that fit a hire key byte', async () => {
    const res = await t.call('POST', '/ranges/demo/bays', { token: staff, body: { number: 9, peakCentsPerHour: 3500 } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 9, name: 'Bay 9', active: true, peakCentsPerHour: 3500, offPeakCentsPerHour: null });
    expect(res.body.checkInUrl).toBe(`https://app.rangeops.test/check-in/${res.body.checkInCode}`);
    expect((await t.call('POST', '/ranges/demo/bays', { token: staff, body: { number: 9 } })).body.error.code).toBe('duplicate_bay_number');
    expect((await t.call('POST', '/ranges/demo/bays', { token: staff, body: { number: 256 } })).status).toBe(400);
    expect((await t.call('POST', '/ranges/demo/bays', { token: staff, body: { number: 0 } })).status).toBe(400);
    expect((await day()).bays.at(-1).slots.find((s: any) => s.localTime === '16:00').priceCents).toBe(3500);
  });

  it("edits a bay's name, prices and whether it takes bookings", async () => {
    const bay = demo.bays[0];
    const res = await t.call('PATCH', `/bays/${bay.id}`, { token: staff, body: { name: 'Family bay', offPeakCentsPerHour: 1500 } });
    expect(res.body).toMatchObject({ name: 'Family bay', offPeakCentsPerHour: 1500, peakCentsPerHour: null });
    const reset = await t.call('PATCH', `/bays/${bay.id}`, { token: staff, body: { offPeakCentsPerHour: null, active: false } });
    expect(reset.body).toMatchObject({ name: 'Family bay', offPeakCentsPerHour: null, active: false });
    expect((await day()).bays).toHaveLength(7);
  });

  it('lists bays with check-in codes and rotates a code', async () => {
    const list = await t.call('GET', '/ranges/demo/bays', { token: staff });
    const bay = list.body.bays[0];
    const rotated = await t.call('POST', `/bays/${bay.id}/check-in-code`, { token: staff });
    expect(rotated.body.checkInCode).not.toBe(bay.checkInCode);
    expect((await t.call('POST', `/check-in/${bay.checkInCode}`, { token })).body.error.code).toBe('unknown_code');
  });

  it('refuses every console endpoint to non-staff', async () => {
    const bay = demo.bays[0].id;
    const calls: [string, string, unknown?][] = [
      ['PATCH', '/ranges/demo', { name: 'Mine' }],
      ['PUT', '/ranges/demo/hours', { openingHours: [] }],
      ['PUT', '/ranges/demo/peak-windows', { peakWindows: [] }],
      ['GET', '/ranges/demo/bays'],
      ['POST', '/ranges/demo/bays', { number: 20 }],
      ['PATCH', `/bays/${bay}`, { name: 'x' }],
      ['POST', `/bays/${bay}/check-in-code`],
      ['GET', '/ranges/demo/bookings'],
      ['GET', '/ranges/demo/orders'],
      ['POST', '/ranges/demo/external-bookings', { bayId: bay, startsAt: FOUR_PM, externalRef: 'x' }],
      ['GET', '/ranges/demo/fleet'],
      ['POST', '/ranges/demo/robots', { serial: 'ZZZZ' }],
    ];
    for (const [method, path, body] of calls) {
      const res = await t.call(method, path, { token, body });
      expect([method, path, res.status]).toEqual([method, path, 403]);
      expect((await t.call(method, path, { body })).status).toBe(401);
    }
  });
});

describe('day views', () => {
  it("lists the day's bookings in local time with who booked", async () => {
    await t.call('POST', '/bookings', { token, body: { bayId: demo.bays[0].id, startsAt: FOUR_PM, paymentMethod: 'pm_fake_ok' } });
    // 07:00 Wednesday in Sydney is still Tuesday in UTC, so it belongs to the 25th.
    await t.call('POST', '/bookings', { token, body: { bayId: demo.bays[0].id, startsAt: '2026-11-24T20:00:00.000Z', paymentMethod: 'pm_fake_ok' } });
    const today = await t.call('GET', '/ranges/demo/bookings', { token: staff });
    expect(today.body.date).toBe('2026-11-24');
    expect(today.body.bookings).toHaveLength(1);
    expect(today.body.bookings[0]).toMatchObject({ startsAt: FOUR_PM, customerEmail: 'parent@example.com' });
    const tomorrow = await t.call('GET', '/ranges/demo/bookings?date=2026-11-25', { token: staff });
    expect(tomorrow.body.bookings).toHaveLength(1);
    expect((await t.call('GET', '/ranges/demo/bookings?date=nope', { token: staff })).status).toBe(400);
  });

  it("lists the day's orders and takings", async () => {
    const b = await t.call('POST', '/bookings', { token, body: { bayId: demo.bays[0].id, startsAt: FOUR_PM, paymentMethod: 'pm_fake_ok' } });
    await t.call('POST', '/orders/buckets', {
      token,
      body: { rangeId: 'demo', bucketProductId: demo.bucketProducts[0].id, payWith: { method: 'card', paymentMethod: 'pm_fake_ok' } },
    });
    await t.call('POST', '/orders/buckets', {
      token,
      body: { rangeId: 'demo', bucketProductId: demo.bucketProducts[0].id, payWith: { method: 'card', paymentMethod: 'pm_fake_declined' } },
    });
    await t.call('POST', `/bookings/${b.body.id}/cancel`, { token });
    const res = await t.call('GET', '/ranges/demo/orders', { token: staff });
    expect(res.body.totals).toEqual({ paidCents: 1000, refundedCents: 2800, orders: 3 });
    expect(res.body.orders.map((o: any) => o.status)).toEqual(['failed', 'paid', 'refunded']);
  });
});

describe('external bookings', () => {
  const external = (body: Record<string, unknown> = {}) =>
    t.call('POST', '/ranges/demo/external-bookings', {
      token: staff,
      body: { bayId: demo.bays[2].id, startsAt: FOUR_PM, addOns: [{ kind: 'robot' }], externalRef: 'TILL-1042', customerName: 'Walk-in family', ...body },
    });

  it('records a booking from another source and turns the robot add-on into a hire key', async () => {
    const res = await external();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: 'external',
      externalRef: 'TILL-1042',
      customerName: 'Walk-in family',
      accountId: null,
      status: 'confirmed',
      bay: { number: 3 },
    });
    expect(res.body.order).toMatchObject({ paymentProvider: 'external', status: 'paid', totalCents: 2800 + 1500 });
    expect(res.body.hire).toMatchObject({ status: 'active', bayNumber: 3 });
    expect(res.body.hire.link).toMatch(/^https:\/\/app\.rangeops\.test\/drive\?hire=/);
    expect(t.payments.charges.size).toBe(0);
  });

  it('blocks the slot like any booking and refuses a repeated reference', async () => {
    await external();
    const clash = await t.call('POST', '/bookings', { token, body: { bayId: demo.bays[2].id, startsAt: FOUR_PM, paymentMethod: 'pm_fake_ok' } });
    expect(clash.body.error.code).toBe('bay_taken');
    const again = await external({ bayId: demo.bays[3].id });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('duplicate_external_ref');
  });

  it('follows the same booking rules', async () => {
    expect((await external({ startsAt: '2026-11-24T05:30:00.000Z' })).body.error.code).toBe('not_on_the_hour');
  });
});

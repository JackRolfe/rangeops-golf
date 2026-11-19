import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => (t = await makeTestApp()));
afterEach(() => t.close());

describe('ranges', () => {
  it('lists the demo range', async () => {
    const res = await t.call('GET', '/ranges');
    expect(res.status).toBe(200);
    expect(res.body.ranges).toEqual([
      expect.objectContaining({ slug: 'demo', name: 'RangeOps Demo Range', timeZone: 'Australia/Sydney', currency: 'AUD' }),
    ]);
  });

  it('shows a range by slug or id, with bays, hours, prices and products', async () => {
    const bySlug = await t.call('GET', '/ranges/demo');
    expect(bySlug.status).toBe(200);
    const r = bySlug.body;
    expect(r.bays).toHaveLength(8);
    expect(r.bays[0]).toMatchObject({ number: 1, name: 'Bay 1', active: true, offPeakCentsPerHour: null });
    expect(r.prices).toEqual({ offPeakCentsPerHour: 1800, peakCentsPerHour: 2800 });
    expect(r.openingHours).toHaveLength(7);
    expect(r.openingHours[0]).toEqual({ weekday: 0, opens: '07:00', closes: '22:00' });
    expect(r.peakWindows).toContainEqual({ weekday: 1, from: '16:00', to: '21:00' });
    expect(r.peakWindows).toContainEqual({ weekday: 6, from: '08:00', to: '14:00' });
    expect(r.addOns).toEqual([
      { kind: 'club_hire', priceCents: 1000, unit: 'per_booking' },
      { kind: 'lesson', priceCents: 7000, unit: 'per_booking' },
      { kind: 'robot', priceCents: 1500, unit: 'per_hour' },
    ]);
    expect(r.bucketProducts.map((b: any) => [b.balls, b.priceCents])).toEqual([[50, 1000], [100, 1800], [150, 2400]]);

    const byId = await t.call('GET', `/ranges/${r.id}`);
    expect(byId.body).toEqual(r);
  });

  it('404s an unknown range', async () => {
    const res = await t.call('GET', '/ranges/nowhere');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('availability', () => {
  it("defaults to today in the range's time zone and prices peak and off-peak hours", async () => {
    const res = await t.call('GET', '/ranges/demo/availability');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-11-24'); // Tuesday
    expect(res.body.bays).toHaveLength(8);
    const slots = res.body.bays[0].slots;
    expect(slots).toHaveLength(15); // 07:00 to 21:00 starts
    expect(slots[0]).toEqual({
      startsAt: '2026-11-23T20:00:00.000Z',
      endsAt: '2026-11-23T21:00:00.000Z',
      localTime: '07:00',
      peak: false,
      priceCents: 1800,
      free: true,
    });
    const four = slots.find((s: any) => s.localTime === '16:00');
    expect(four).toMatchObject({ peak: true, priceCents: 2800 });
    const nine = slots.find((s: any) => s.localTime === '21:00');
    expect(nine).toMatchObject({ peak: false, priceCents: 1800 });
    expect(res.body.hours[0]).toMatchObject({ startsAt: '2026-11-23T20:00:00.000Z', localTime: '07:00' });
  });

  it('uses weekend peak windows', async () => {
    const res = await t.call('GET', '/ranges/demo/availability?date=2026-11-28');
    const slots = res.body.bays[0].slots;
    expect(slots.filter((s: any) => s.peak).map((s: any) => s.localTime)).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']);
  });

  it('follows the daylight-saving change', async () => {
    const before = await t.call('GET', '/ranges/demo/availability?date=2026-10-03');
    const after = await t.call('GET', '/ranges/demo/availability?date=2026-10-04');
    expect(before.body.bays[0].slots[0].startsAt).toBe('2026-10-02T21:00:00.000Z'); // +10
    expect(after.body.bays[0].slots[0].startsAt).toBe('2026-10-03T20:00:00.000Z'); // +11
  });

  it('refuses a malformed date', async () => {
    const res = await t.call('GET', '/ranges/demo/availability?date=2026-13-01');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let bays: any[];
let codes: Map<number, string>;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  token = await t.signIn('parent@example.com');
  bays = (await t.demo()).bays;
  const rows = await t.deps.db.many<{ number: number; check_in_code: string }>('select number, check_in_code from bays');
  codes = new Map(rows.map((r) => [r.number, r.check_in_code]));
});
afterEach(() => t.close());

const TEN_AM = '2026-11-23T23:00:00.000Z';
const book = (addOns: any[] = [], as = token) =>
  t.call('POST', '/bookings', { token: as, body: { bayId: bays[0].id, startsAt: TEN_AM, addOns, paymentMethod: 'pm_fake_ok' } });
const checkIn = (bay = 1, as = token) => t.call('POST', `/check-in/${codes.get(bay)}`, { token: as });

describe('check-in', () => {
  it('gives every bay its own random code', () => {
    expect(new Set(codes.values()).size).toBe(8);
    for (const c of codes.values()) expect(c).toMatch(/^[0-9a-f]{32}$/);
  });

  it('checks in 10 minutes early and returns the hire link issued at booking', async () => {
    const booked = await book([{ kind: 'robot' }]);
    t.clock.set('2026-11-23T22:50:00Z');
    const res = await checkIn();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checkedInAt: '2026-11-23T22:50:00.000Z', bay: { number: 1 } });
    expect(res.body.booking.checkedInAt).toBe('2026-11-23T22:50:00.000Z');
    expect(res.body.hireLink).toBe(booked.body.hire.link);
    expect(res.body.booking.hire.key).toEqual(booked.body.hire.key);
  });

  it('is too early 20 minutes before', async () => {
    await book();
    t.clock.set('2026-11-23T22:40:00Z');
    const res = await checkIn();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('no_booking');
  });

  it('works during the booking, keeps the first time, and has no link without a robot', async () => {
    await book();
    t.clock.set('2026-11-23T23:20:00Z');
    expect((await checkIn()).body.hireLink).toBeNull();
    t.clock.set('2026-11-23T23:40:00Z');
    expect((await checkIn()).body.checkedInAt).toBe('2026-11-23T23:20:00.000Z');
    t.clock.set('2026-11-24T00:00:00Z');
    expect((await checkIn()).body.error.code).toBe('no_booking');
  });

  it("doesn't find someone else's booking, or one at another bay", async () => {
    await book();
    t.clock.set('2026-11-23T23:00:00Z');
    const other = await t.signIn('other@example.com');
    expect((await checkIn(1, other)).body.error.code).toBe('no_booking');
    expect((await checkIn(2)).body.error.code).toBe('no_booking');
  });

  it('404s an unknown code and needs a session', async () => {
    const res = await t.call('POST', '/check-in/not-a-bay', { token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('unknown_code');
    expect((await t.call('POST', `/check-in/${codes.get(1)}`)).status).toBe(401);
  });

  it("doesn't check in a cancelled booking", async () => {
    const b = await book();
    await t.call('POST', `/bookings/${b.body.id}/cancel`, { token });
    t.clock.set('2026-11-23T23:00:00Z');
    expect((await checkIn()).body.error.code).toBe('no_booking');
  });
});

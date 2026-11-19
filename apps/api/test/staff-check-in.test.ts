import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let player: string;
let staff: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  player = await t.signIn('parent@example.com');
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
});
afterEach(() => t.close());

const TEN_AM = '2026-11-23T23:00:00.000Z';
const book = async () =>
  (await t.call('POST', '/bookings', { token: player, body: { bayId: demo.bays[0].id, startsAt: TEN_AM, paymentMethod: 'pm_fake_ok' } })).body;

describe('POST /bookings/{id}/check-in', () => {
  it('lets staff check a player in once', async () => {
    const booking = await book();
    const res = await t.call('POST', `/bookings/${booking.id}/check-in`, { token: staff });
    expect(res.status).toBe(200);
    expect(res.body.checkedInAt).toBe('2026-11-23T22:00:00.000Z');
    const again = await t.call('POST', `/bookings/${booking.id}/check-in`, { token: staff });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_checked_in');
  });

  it('refuses a cancelled booking', async () => {
    const booking = await book();
    await t.call('POST', `/bookings/${booking.id}/cancel`, { token: staff });
    const res = await t.call('POST', `/bookings/${booking.id}/check-in`, { token: staff });
    expect(res.body.error.code).toBe('cancelled');
  });

  it('is for staff only', async () => {
    const booking = await book();
    expect((await t.call('POST', `/bookings/${booking.id}/check-in`, { token: player })).status).toBe(403);
    expect((await t.call('POST', `/bookings/${booking.id}/check-in`)).status).toBe(401);
    expect((await t.call('POST', '/bookings/00000000-0000-4000-8000-000000000000/check-in', { token: staff })).status).toBe(404);
  });
});

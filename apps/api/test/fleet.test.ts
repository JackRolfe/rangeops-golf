import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let staff: string;
let demo: any;
let robots: any[];
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  token = await t.signIn('parent@example.com');
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
  robots = (await t.call('GET', '/ranges/demo/fleet', { token: staff })).body.robots;
});
afterEach(() => t.close());

const bookRobot = (startsAt: string, bay = 1) =>
  t.call('POST', '/bookings', {
    token,
    body: { bayId: demo.bays[bay - 1].id, startsAt, addOns: [{ kind: 'robot' }], paymentMethod: 'pm_fake_ok' },
  });

describe('fleet', () => {
  it('lists the robots with their home bays, for staff only', async () => {
    expect(robots.map((r) => [r.serial, r.bluetoothName, r.homeBay?.number, r.inService])).toEqual([
      ['A1B2', 'Mulligan-A1B2', 1, true],
      ['C3D4', 'Mulligan-C3D4', 2, true],
    ]);
    expect(robots[0].status).toEqual({ state: null, batteryPct: null, ballsOnBoard: null, firmware: null, lastSeenAt: null });
    expect((await t.call('GET', '/ranges/demo/fleet', { token })).status).toBe(403);
    expect((await t.call('GET', '/ranges/demo/fleet')).status).toBe(401);
  });

  it("shows each robot's current and next hire today", async () => {
    const now = await bookRobot('2026-11-23T22:00:00.000Z'); // 09:00, now
    const later = await bookRobot('2026-11-24T05:00:00.000Z'); // 16:00
    await bookRobot('2026-11-24T23:00:00.000Z'); // tomorrow, not shown
    const fleet = (await t.call('GET', '/ranges/demo/fleet', { token: staff })).body;
    const a1 = fleet.robots.find((r: any) => r.serial === 'A1B2');
    expect(a1.currentHire).toMatchObject({ bookingId: now.body.id, bayNumber: 1, endsAt: '2026-11-23T23:00:00.000Z', checkedInAt: null });
    expect(a1.nextHire).toMatchObject({ bookingId: later.body.id, startsAt: '2026-11-24T05:00:00.000Z' });
    expect(fleet.robots.find((r: any) => r.serial === 'C3D4').currentHire).toBeNull();
  });

  it('takes status from staff, or from the hirer only during the hire', async () => {
    await bookRobot('2026-11-23T23:00:00.000Z'); // 10:00
    const report = { state: 'driving', batteryPct: 87, ballsOnBoard: 3, firmware: 'r0-0.1.0' };
    const early = await t.call('POST', `/robots/${robots[0].id}/status`, { token, body: report });
    expect(early.status).toBe(403);

    t.clock.set('2026-11-23T23:30:00Z');
    const res = await t.call('POST', `/robots/${robots[0].id}/status`, { token, body: report });
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({ state: 'driving', batteryPct: 87, ballsOnBoard: 3, firmware: 'r0-0.1.0', lastSeenAt: '2026-11-23T23:30:00.000Z' });

    const other = await t.signIn('other@example.com');
    expect((await t.call('POST', `/robots/${robots[0].id}/status`, { token: other, body: report })).status).toBe(403);
    const byStaff = await t.call('POST', `/robots/${robots[1].id}/status`, { token: staff, body: { state: 'idle', batteryPct: 100 } });
    expect(byStaff.body.status).toMatchObject({ state: 'idle', batteryPct: 100, ballsOnBoard: null });

    const bad = await t.call('POST', `/robots/${robots[1].id}/status`, { token: staff, body: { state: 'flying', batteryPct: 100 } });
    expect(bad.status).toBe(400);
  });

  it('adds robots with unique 4-character serials', async () => {
    const res = await t.call('POST', '/ranges/demo/robots', { token: staff, body: { serial: 'E5F6', homeBayId: demo.bays[2].id } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ serial: 'E5F6', name: 'Mulligan E5F6', homeBay: { number: 3 }, inService: true });
    expect((await t.call('POST', '/ranges/demo/robots', { token: staff, body: { serial: 'E5F6' } })).body.error.code).toBe('duplicate_serial');
    expect((await t.call('POST', '/ranges/demo/robots', { token: staff, body: { serial: 'e5f7' } })).status).toBe(400);
    expect((await t.call('POST', '/ranges/demo/robots', { token: staff, body: { serial: 'E5F' } })).status).toBe(400);
    expect((await t.call('POST', '/ranges/demo/robots', { token, body: { serial: 'G7H8' } })).status).toBe(403);
    const badBay = await t.call('POST', '/ranges/demo/robots', { token: staff, body: { serial: 'G7H8', homeBayId: '00000000-0000-4000-8000-000000000000' } });
    expect(badBay.body.error.code).toBe('bad_home_bay');
  });

  it('takes a robot out of service so it is never hired', async () => {
    const res = await t.call('PATCH', `/robots/${robots[0].id}`, { token: staff, body: { inService: false, name: 'Old faithful', homeBayId: null } });
    expect(res.body).toMatchObject({ inService: false, name: 'Old faithful', homeBay: null });
    expect((await bookRobot('2026-11-24T05:00:00.000Z', 1)).body.hire.robot.serial).toBe('C3D4');
    expect((await bookRobot('2026-11-24T05:00:00.000Z', 2)).body.error.code).toBe('no_robot_free');
    const day = await t.call('GET', '/ranges/demo/availability?date=2026-11-24');
    expect(day.body.hours[0].robotsFree).toBe(1);
  });
});

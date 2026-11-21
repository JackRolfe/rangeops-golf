import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeHireKey, verifyHireKey } from '../src/hires/hireKey.js';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let bays: any[];
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  token = await t.signIn('parent@example.com');
  bays = (await t.demo()).bays;
});
afterEach(() => t.close());

const FOUR_PM = '2026-11-24T05:00:00.000Z';

const bookRobot = (bay: number, body: Record<string, unknown> = {}, as = token) =>
  t.call('POST', '/bookings', {
    token: as,
    body: { bayId: bays[bay - 1].id, startsAt: FOUR_PM, addOns: [{ kind: 'robot' }], paymentMethod: 'pm_fake_ok', ...body },
  });

describe('robot hire', () => {
  it('assigns the robot docked at the bay and returns a signed key for the booked hours', async () => {
    const res = await bookRobot(1, { hours: 2 });
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(2800 * 2 + 1500 * 2);
    const hire = res.body.hire;
    expect(hire).toMatchObject({
      status: 'active',
      robot: { serial: 'A1B2', bluetoothName: 'Mulligan-A1B2' },
      bayNumber: 1,
      startsAt: FOUR_PM,
      endsAt: '2026-11-24T07:00:00.000Z',
    });

    const key = Buffer.from(hire.key.base64url, 'base64url');
    expect(key.toString('hex')).toBe(hire.key.hex);
    expect(decodeHireKey(key)).toMatchObject({
      version: 1,
      serial: 'A1B2',
      start: Date.parse(FOUR_PM) / 1000,
      end: Date.parse('2026-11-24T07:00:00.000Z') / 1000,
      bay: 1,
    });
    const pub = await t.call('GET', '/hire-keys/public-key');
    expect(pub.body).toMatchObject({ algorithm: 'Ed25519', keyVersion: 1 });
    expect(verifyHireKey(key, Buffer.from(pub.body.hex, 'hex'))).toBe(true);

    expect(hire.link).toBe(`https://app.rangeops.test/drive?hire=${hire.key.base64url}`);
  });

  it('prefers the bay\'s own robot, then any free one', async () => {
    expect((await bookRobot(2)).body.hire.robot.serial).toBe('C3D4');
    expect((await bookRobot(5)).body.hire.robot.serial).toBe('A1B2');
  });

  it('refuses a third robot for the same hour, without charging', async () => {
    expect((await bookRobot(1)).status).toBe(201);
    expect((await bookRobot(2)).status).toBe(201);
    const third = await bookRobot(3);
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('no_robot_free');
    expect(t.payments.charges.size).toBe(2);
    // The bay itself is still free to book without a robot.
    expect((await bookRobot(3, { addOns: [] })).status).toBe(201);
  });

  it('frees the robot when payment is declined or the booking is cancelled', async () => {
    const declined = await bookRobot(1, { paymentMethod: 'pm_fake_declined' });
    expect(declined.status).toBe(402);
    const a = await bookRobot(1);
    expect(a.body.hire.robot.serial).toBe('A1B2');

    const cancelled = await t.call('POST', `/bookings/${a.body.id}/cancel`, { token });
    expect(cancelled.body.hire).toMatchObject({ status: 'cancelled', key: null, link: null });
    expect((await bookRobot(1)).body.hire.robot.serial).toBe('A1B2');
  });

  it('never hires out a robot that is out of service', async () => {
    await t.deps.db.many("update robots set in_service = false where serial = 'A1B2'");
    expect((await bookRobot(1)).body.hire.robot.serial).toBe('C3D4');
    expect((await bookRobot(2)).status).toBe(409);
  });

  it('counts free robots in availability', async () => {
    await bookRobot(1, { hours: 2 });
    const day = await t.call('GET', '/ranges/demo/availability?date=2026-11-24');
    const free = Object.fromEntries(day.body.hours.map((h: any) => [h.localTime, h.robotsFree]));
    expect(free['15:00']).toBe(2);
    expect(free['16:00']).toBe(1);
    expect(free['17:00']).toBe(1);
    expect(free['18:00']).toBe(2);
  });

  it('shows the hire on the booking later', async () => {
    const a = await bookRobot(1);
    const again = await t.call('GET', `/bookings/${a.body.id}`, { token });
    expect(again.body.hire).toEqual(a.body.hire);
  });
});

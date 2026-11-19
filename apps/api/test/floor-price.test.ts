import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let staff: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp();
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
});
afterEach(() => t.close());

const patchRange = (body: unknown) => t.call('PATCH', '/ranges/demo', { token: staff, body });

describe('floor price', () => {
  it('is set on the range and shown with its prices', async () => {
    const res = await patchRange({ floorCentsPerHour: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.prices).toEqual({ offPeakCentsPerHour: 1800, peakCentsPerHour: 2800, floorCentsPerHour: 1500 });
  });

  it('refuses range prices below it, and a floor above them', async () => {
    await patchRange({ floorCentsPerHour: 1500 });
    const low = await patchRange({ offPeakCentsPerHour: 1400 });
    expect(low.status).toBe(422);
    expect(low.body.error).toEqual({ code: 'below_floor', message: "Bay-hour prices can't be below the floor of $15.00." });
    expect((await patchRange({ floorCentsPerHour: 2000 })).body.error.code).toBe('below_floor');
    expect((await patchRange({ floorCentsPerHour: 1000, offPeakCentsPerHour: 1200 })).status).toBe(200);
  });

  it("refuses a bay's own price below it, and a floor above a bay's own price", async () => {
    await patchRange({ floorCentsPerHour: 1500 });
    const bay = demo.bays[0].id;
    expect((await t.call('PATCH', `/bays/${bay}`, { token: staff, body: { peakCentsPerHour: 1400 } })).body.error.code).toBe('below_floor');
    expect((await t.call('POST', '/ranges/demo/bays', { token: staff, body: { number: 9, offPeakCentsPerHour: 1000 } })).status).toBe(422);
    expect((await t.call('PATCH', `/bays/${bay}`, { token: staff, body: { peakCentsPerHour: 1600 } })).status).toBe(200);
    const raise = await patchRange({ floorCentsPerHour: 1700 });
    expect(raise.body.error).toEqual({ code: 'below_floor', message: 'Bay 1 has its own price below the floor. Change it first.' });
  });
});

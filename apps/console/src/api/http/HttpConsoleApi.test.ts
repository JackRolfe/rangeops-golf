import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiBooking, ApiFleetRobot, ApiRange, ApiStaffBay, ApiStaffOrder } from './apiTypes';
import { HttpConsoleApi, peaksFromApi, setupFromApi } from './HttpConsoleApi';

// Shaped like apps/api's demo range: Sydney, $18/$28 an hour, open 07:00–22:00.
const RANGE_ID = '11111111-1111-4111-8111-111111111111';
const bayId = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function apiRange(): ApiRange {
  return {
    id: RANGE_ID,
    slug: 'demo',
    name: 'RangeOps Demo Range',
    timeZone: 'Australia/Sydney',
    currency: 'AUD',
    prices: { offPeakCentsPerHour: 1800, peakCentsPerHour: 2800, floorCentsPerHour: 1500 },
    openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '07:00', closes: '22:00' })),
    peakWindows: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '16:00', to: '21:00' })),
      ...[0, 6].map((weekday) => ({ weekday, from: '08:00', to: '14:00' })),
    ],
    bays: [1, 2, 3].map((n) => apiBay(n)),
    addOns: [{ kind: 'robot', priceCents: 1500, unit: 'per_hour' }],
    bucketProducts: [
      { id: 'p-large', name: 'Large bucket', balls: 150, priceCents: 2400, active: true },
      { id: 'p-small', name: 'Small bucket', balls: 50, priceCents: 1000, active: true },
      { id: 'p-medium', name: 'Medium bucket', balls: 100, priceCents: 1800, active: true },
    ],
    passProducts: [
      { id: 'pp1', kind: 'monthly_pass', name: 'Monthly pass', priceCents: 4900, days: 30, discountPercent: 10, balls: null, active: true },
      { id: 'pp2', kind: 'ball_credit', name: '500 balls of credit', priceCents: 8000, days: null, discountPercent: null, balls: 500, active: true },
    ],
  };
}

function apiBay(n: number, own: Partial<ApiStaffBay> = {}): ApiStaffBay {
  return {
    id: bayId(n),
    rangeId: RANGE_ID,
    number: n,
    name: `Bay ${n}`,
    active: true,
    offPeakCentsPerHour: null,
    peakCentsPerHour: null,
    checkInCode: `code${n}`,
    checkInUrl: `http://localhost:5173/app/check-in/code${n}`,
    ...own,
  };
}

const order = (o: Partial<ApiStaffOrder>): ApiStaffOrder => ({
  id: 'o1',
  accountId: null,
  rangeId: RANGE_ID,
  kind: 'booking',
  status: 'paid',
  totalCents: 0,
  lines: [],
  paymentProvider: 'fake',
  createdAt: '2026-11-23T22:00:00.000Z',
  paidAt: '2026-11-23T22:00:00.000Z',
  refundedAt: null,
  bucketCode: null,
  ...o,
});

type Handler = (body: unknown) => { status?: number; json: unknown };

/** A fetch that answers from a table of "METHOD path" handlers and records every call. */
function fakeApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('http://api.test', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const handler = routes[`${method} ${path}`];
    const { status = 200, json } = handler ? handler(body) : { status: 404, json: { error: { code: 'not_found', message: `No route ${method} ${path}` } } };
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

let range: ApiRange;
let bays: ApiStaffBay[];
beforeEach(() => {
  range = apiRange();
  bays = [apiBay(1, { offPeakCentsPerHour: 2600, peakCentsPerHour: 3600 }), apiBay(2), apiBay(3, { active: false })];
});

const setupRoutes = (): Record<string, Handler> => ({
  'GET /ranges/demo': () => ({ json: range }),
  [`GET /ranges/${RANGE_ID}`]: () => ({ json: range }),
  'GET /ranges/demo/bays': () => ({ json: { bays } }),
  [`GET /ranges/${RANGE_ID}/bays`]: () => ({ json: { bays } }),
});

const make = (routes: Record<string, Handler>, onUnauthorized?: () => void) => {
  const api = fakeApi({ ...setupRoutes(), ...routes });
  return { ...api, console: new HttpConsoleApi({ baseUrl: 'http://api.test/', token: 'tok', rangeId: 'demo', fetch: api.fetch, onUnauthorized }) };
};

describe('setupFromApi', () => {
  it("maps the range's prices, bays, hours and products onto the console's setup", () => {
    const setup = setupFromApi(range, bays);
    expect(setup.range).toEqual({ id: RANGE_ID, name: 'RangeOps Demo Range', timezone: 'Australia/Sydney', currency: 'AUD', publicAppUrl: 'http://localhost:5173/app/' });
    expect(setup.prices.bands).toEqual({
      standard: { offPeak: 1800, peak: 2800, floor: 1500 },
      premium: { offPeak: 2600, peak: 3600, floor: 1500 },
    });
    expect(setup.bays.map((b) => [b.number, b.band, b.inService, b.checkInUrl])).toEqual([
      [1, 'premium', true, 'http://localhost:5173/app/check-in/code1'],
      [2, 'standard', true, 'http://localhost:5173/app/check-in/code2'],
      [3, 'standard', false, 'http://localhost:5173/app/check-in/code3'],
    ]);
    expect(setup.openingHours).toEqual(Array(7).fill({ open: 7, close: 22 }));
    expect(setup.prices.buckets).toEqual({ small: 1000, medium: 1800, large: 2400 });
    expect(setup.prices.bucketBalls).toEqual({ small: 50, medium: 100, large: 150 });
    expect(setup.prices.robotHirePerHour).toBe(1500);
    expect(setup.prices.monthlyPass).toEqual({ price: 4900, days: 30, discountPercent: 10 });
    expect(setup.prices.creditPack).toEqual({ price: 8000, balls: 500 });
  });

  it('groups weekdays that share peak hours, and marks closed days', () => {
    expect(peaksFromApi(range.peakWindows)).toEqual([
      { days: [1, 2, 3, 4, 5], start: 16, end: 21 },
      { days: [0, 6], start: 8, end: 14 },
    ]);
    const hours = setupFromApi({ ...range, openingHours: [{ weekday: 2, opens: '07:30', closes: '21:45' }] }, bays).openingHours;
    expect(hours[2]).toEqual({ open: 8, close: 21 });
    expect(hours[3]).toBeNull();
  });
});

describe('saveSetup', () => {
  it('sends only what changed: range prices, a bay moved to premium, and hours', async () => {
    const { console: api, calls } = make({
      [`PATCH /ranges/${RANGE_ID}`]: () => ({ json: range }),
      [`PATCH /bays/${bayId(2)}`]: () => ({ json: bays[1] }),
      [`PUT /ranges/${RANGE_ID}/hours`]: () => ({ json: range }),
    });
    const setup = await api.getSetup();
    setup.range.name = 'Harbourside';
    setup.prices.bands.standard.offPeak = 2000;
    setup.bays[1]!.band = 'premium';
    setup.openingHours[1] = { open: 7, close: 21 };
    const result = await api.saveSetup(setup);
    expect(result.ok).toBe(true);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes).toEqual([
      { method: 'PATCH', path: `/bays/${bayId(2)}`, body: { offPeakCentsPerHour: 2600, peakCentsPerHour: 3600 } },
      { method: 'PATCH', path: `/ranges/${RANGE_ID}`, body: { name: 'Harbourside', offPeakCentsPerHour: 2000, peakCentsPerHour: 2800, floorCentsPerHour: 1500 } },
      { method: 'PUT', path: `/ranges/${RANGE_ID}/hours`, body: { openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '07:00', closes: weekday === 1 ? '21:00' : '22:00' })) } },
    ]);
  });

  it('lowers the floor before the bays, so no price is checked against the old one', async () => {
    const { console: api, calls } = make({
      [`PATCH /ranges/${RANGE_ID}`]: () => ({ json: range }),
      [`PATCH /bays/${bayId(1)}`]: () => ({ json: bays[0] }),
    });
    const setup = await api.getSetup();
    setup.prices.bands.standard.floor = 1000;
    setup.prices.bands.premium = { offPeak: 1200, peak: 3600, floor: 1000 };
    expect((await api.saveSetup(setup)).ok).toBe(true);
    expect(calls.filter((c) => c.method !== 'GET').map((c) => c.path)).toEqual([`/ranges/${RANGE_ID}`, `/bays/${bayId(1)}`]);
  });

  it("refuses what the API can't store, without calling it", async () => {
    const { console: api, calls } = make({});
    const setup = await api.getSetup();
    setup.prices.bands.premium.floor = 2000;
    setup.prices.buckets.small = 900;
    const result = await api.saveSetup(setup);
    expect(result).toEqual({
      ok: false,
      errors: [
        'This range has one floor price for every bay. Set the same floor for both bands.',
        'Robot, bucket and pass prices are set in the backend and can’t be changed here yet.',
      ],
    });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it("passes on the API's refusal", async () => {
    const { console: api } = make({
      [`PATCH /ranges/${RANGE_ID}`]: () => ({ status: 422, json: { error: { code: 'below_floor', message: 'Bay 1 has its own price below the floor.' } } }),
    });
    const setup = await api.getSetup();
    setup.prices.bands.standard.peak = 3000;
    expect(await api.saveSetup(setup)).toEqual({ ok: false, errors: ['Bay 1 has its own price below the floor.'] });
  });
});

describe('bookings', () => {
  const booking = (b: Partial<ApiBooking>): ApiBooking => ({
    id: 'b1',
    bay: { id: bayId(2), number: 2, name: 'Bay 2' },
    accountId: 'a1',
    source: 'rangeops',
    externalRef: null,
    customerName: null,
    customerEmail: 'parent@example.com',
    startsAt: '2026-11-24T05:00:00.000Z',
    endsAt: '2026-11-24T07:00:00.000Z',
    hours: 2,
    status: 'confirmed',
    checkedInAt: null,
    addOns: [{ kind: 'robot', quantity: 1, priceCents: 3000 }],
    totalCents: 8600,
    order: order({ paidAt: '2026-11-23T21:15:00.000Z' }),
    createdAt: '2026-11-23T21:14:00.000Z',
    ...b,
  });

  it('lists them in the range’s local time', async () => {
    const { console: api } = make({
      'GET /ranges/11111111-1111-4111-8111-111111111111/bookings?date=2026-11-24': () => ({
        json: { bookings: [booking({}), booking({ id: 'b2', source: 'external', customerName: 'Walk-in family', customerEmail: null, startsAt: '2026-11-23T21:00:00.000Z', checkedInAt: '2026-11-23T21:02:00.000Z', addOns: [] })] },
      }),
    });
    const list = await api.listBookings('2026-11-24');
    expect(list.map((b) => [b.id, b.date, b.start, b.player, b.source, b.status, b.robotHire])).toEqual([
      ['b2', '2026-11-24', 8, 'Walk-in family', 'partner', 'checked-in', false],
      ['b1', '2026-11-24', 16, 'parent@example.com', 'app', 'booked', true],
    ]);
    expect(list[1]).toMatchObject({ amount: 8600, paidAt: '2026-11-24T08:15' });
  });

  it('checks in and cancels through the API, and reports a refusal', async () => {
    const { console: api, calls } = make({
      'POST /bookings/b1/check-in': () => ({ json: booking({ checkedInAt: '2026-11-24T05:01:00.000Z' }) }),
      'POST /bookings/b2/check-in': () => ({ status: 409, json: { error: { code: 'already_checked_in', message: 'This booking is already checked in.' } } }),
      'POST /bookings/b1/cancel': () => ({ json: booking({ status: 'cancelled' }) }),
    });
    expect(await api.setBookingStatus('b1', 'checked-in')).toMatchObject({ ok: true, value: { status: 'checked-in' } });
    expect(await api.setBookingStatus('b2', 'checked-in')).toEqual({ ok: false, errors: ['This booking is already checked in.'] });
    expect(await api.setBookingStatus('b1', 'cancelled')).toMatchObject({ ok: true, value: { status: 'cancelled' } });
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/bookings/b1/check-in', '/bookings/b2/check-in', '/bookings/b1/cancel']);
  });
});

describe('bucket handover', () => {
  const code = { id: 'c1', code: 'K7QM-4XRT', rangeId: RANGE_ID, bucket: { productId: 'p-medium', name: 'Medium bucket', balls: 100 }, orderId: 'o9', accountId: 'a1', createdAt: '2026-11-23T23:00:00.000Z' };
  const orders = { orders: [order({ id: 'o9', kind: 'bucket', totalCents: 1800, paidAt: '2026-11-23T23:00:00.000Z', bucketCode: { ...code, redeemedAt: null } })] };
  const base = `/ranges/${RANGE_ID}/bucket-codes`;

  it('hands over a code and shows the bucket and what was paid', async () => {
    const { console: api } = make({
      [`POST ${base}/k7qm-4xrt/redeem`]: () => ({ json: { ...code, redeemedAt: '2026-11-23T23:30:00.000Z' } }),
      [`GET /ranges/${RANGE_ID}/orders?date=2026-11-24`]: () => ({ json: orders }),
    });
    expect(await api.handOverBucket(' k7qm-4xrt ')).toEqual({
      outcome: 'handed-over',
      order: { id: 'o9', code: 'K7QM-4XRT', bucket: 'medium', balls: 100, status: 'handed-over', source: 'app', amount: 1800, paidAt: '2026-11-24T10:00', handedOverAt: '2026-11-24T10:30', passId: null },
    });
  });

  it('says when a code was already handed over, or is unknown', async () => {
    const { console: api } = make({
      [`POST ${base}/K7QM4XRT/redeem`]: () => ({ status: 409, json: { error: { code: 'already_redeemed', message: 'Handed over.' } } }),
      [`GET ${base}/K7QM4XRT`]: () => ({ json: { ...code, redeemedAt: '2026-11-23T23:30:00.000Z' } }),
      [`GET /ranges/${RANGE_ID}/orders?date=2026-11-24`]: () => ({ json: orders }),
      [`POST ${base}/ZZZZ2222/redeem`]: () => ({ status: 404, json: { error: { code: 'unknown_code', message: 'No such code.' } } }),
    });
    expect(await api.handOverBucket('K7QM4XRT')).toMatchObject({ outcome: 'already-handed-over', order: { handedOverAt: '2026-11-24T10:30' } });
    expect(await api.handOverBucket('ZZZZ2222')).toEqual({ outcome: 'not-found', code: 'ZZZZ2222' });
  });
});

describe('takings', () => {
  it("splits a booking's robot hire from the bay, and counts a refund on the day it was given", async () => {
    const { console: api } = make({
      [`GET /ranges/${RANGE_ID}/orders?date=2026-11-24`]: () => ({
        json: {
          orders: [
            order({
              id: 'ob',
              totalCents: 4600,
              lines: [
                { description: 'Bay 2, 16:00 peak', quantity: 1, unitCents: 2800 },
                { description: 'Mulligan robot hire, per hour', quantity: 1, unitCents: 1500 },
                { description: 'Monthly pass: 10% off bay-hours', quantity: 1, unitCents: 300 - 280 - 20 },
                { description: 'Club hire', quantity: 1, unitCents: 300 },
              ],
            }),
            order({ id: 'ok', kind: 'bucket', totalCents: 1000 }),
            order({ id: 'op', kind: 'ball_credit', totalCents: 8000 }),
            order({ id: 'or', kind: 'booking', status: 'refunded', totalCents: 2800, lines: [{ description: 'Bay 1', quantity: 1, unitCents: 2800 }], refundedAt: '2026-11-24T01:00:00.000Z' }),
            order({ id: 'of', kind: 'bucket', status: 'failed', totalCents: 1000, paidAt: null }),
          ],
        },
      }),
    });
    const payments = await api.listPayments('2026-11-24');
    const byKind = (kind: string) => payments.filter((p) => p.kind === kind).reduce((sum, p) => sum + p.amount, 0);
    expect(byKind('bay')).toBe(3100);
    expect(byKind('robot')).toBe(1500);
    expect(byKind('bucket')).toBe(1000);
    expect(byKind('pass')).toBe(8000);
    expect(payments.filter((p) => p.amount < 0)).toEqual([{ id: 'or-bay-refund', at: '2026-11-24T12:00', kind: 'bay', amount: -2800, ref: 'or' }]);
  });
});

describe('fleet and passes', () => {
  it("maps robot states and the bay each one is hired to", async () => {
    const robot = (r: Partial<ApiFleetRobot>): ApiFleetRobot => ({
      id: 'r1',
      name: 'Mulligan A1B2',
      inService: true,
      status: { state: null, batteryPct: null, ballsOnBoard: null, lastSeenAt: null },
      currentHire: null,
      ...r,
    });
    const { console: api } = make({
      [`GET /ranges/${RANGE_ID}/fleet`]: () => ({
        json: {
          at: '2026-11-24T05:10:00.000Z',
          robots: [
            robot({ status: { state: 'driving', batteryPct: 71, ballsOnBoard: 4, lastSeenAt: '2026-11-24T05:09:00.000Z' }, currentHire: { hireId: 'h', bookingId: 'b1', bayNumber: 2, startsAt: '2026-11-24T05:00:00.000Z', endsAt: '2026-11-24T06:00:00.000Z' } }),
            robot({ id: 'r2', status: { state: 'idle', batteryPct: 96, ballsOnBoard: 0, lastSeenAt: null } }),
            robot({ id: 'r3' }),
            robot({ id: 'r4', status: { state: 'stopped_by_switch', batteryPct: 40, ballsOnBoard: 0, lastSeenAt: null } }),
          ],
        },
      }),
    });
    const robots = await api.listRobots();
    expect(robots.map((r) => [r.id, r.state, r.battery])).toEqual([
      ['r1', 'driving', 71],
      ['r2', 'docked', 96],
      ['r3', 'docked', null],
      ['r4', 'stopped', 40],
    ]);
    expect(robots[0]!.hire).toEqual({ bookingId: 'b1', bayId: bayId(2), until: '2026-11-24T17:00' });
    expect(robots[0]!.lastSeen).toBe('2026-11-24T16:09');
  });

  it('lists discount passes and ball credit', async () => {
    const holder = { id: 'a1', email: 'parent@example.com', name: null };
    const { console: api } = make({
      [`GET /ranges/${RANGE_ID}/passes`]: () => ({
        json: {
          passes: [{ id: 'p1', account: holder, name: 'Monthly pass', discountPercent: 10, validFrom: '2026-11-23T22:00:00.000Z', validTo: '2026-12-23T13:00:00.000Z', createdAt: '2026-11-23T22:00:00.000Z' }],
          ballCredit: [{ account: { ...holder, name: 'Grace Tan' }, balls: 350 }],
        },
      }),
    });
    const passes = await api.listPasses();
    expect(passes[0]).toMatchObject({ accountId: 'a1', player: 'parent@example.com', email: 'parent@example.com', kind: 'monthly', discountPercent: 10, soldAt: '2026-11-24T09:00', validUntil: '2026-12-23' });
    expect(passes[1]).toMatchObject({ id: 'credit-a1', player: 'Grace Tan', kind: 'credits', ballsLeft: 350, validUntil: null, soldAt: null });
  });

  it('sells a monthly pass and ball credit at the counter', async () => {
    const holder = { id: 'a7', email: 'walkers@example.com', name: 'The Walkers' };
    const { console: api, calls } = make({
      [`POST /ranges/${RANGE_ID}/counter/passes`]: (body: any) => ({
        status: 201,
        json:
          body.passProductId === 'pp1'
            ? { order: order({ kind: 'pass' }), account: holder, ballCredit: null, pass: { id: 'p9', account: holder, name: 'Monthly pass', discountPercent: 10, validFrom: '2026-11-23T22:00:00.000Z', validTo: '2026-12-23T22:00:00.000Z', createdAt: '2026-11-23T22:00:00.000Z' } }
            : { order: order({ kind: 'ball_credit' }), account: holder, pass: null, ballCredit: 500 },
      }),
    });
    expect(api.capabilities).toMatchObject({ sellPasses: true, redeemPasses: true });
    expect(await api.sellPass({ email: ' walkers@example.com ', name: 'The Walkers', kind: 'monthly' })).toMatchObject({
      ok: true,
      value: { id: 'p9', kind: 'monthly', player: 'The Walkers', validUntil: '2026-12-24', discountPercent: 10 },
    });
    expect(await api.sellPass({ email: 'walkers@example.com', kind: 'credits' })).toMatchObject({ ok: true, value: { id: 'credit-a7', ballsLeft: 500 } });
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { email: 'walkers@example.com', name: 'The Walkers', passProductId: 'pp1' },
      { email: 'walkers@example.com', passProductId: 'pp2' },
    ]);
    expect(await api.sellPass({ email: 'nope', kind: 'credits' })).toEqual({ ok: false, errors: ['Passes are held on an account: enter the player’s email.'] });
  });

  it('hands a bucket out of ball credit, and passes on a refusal', async () => {
    const holder = { id: 'a7', email: 'grace@example.com', name: 'Grace Tan' };
    let credit = 500;
    const { console: api, calls } = make({
      [`POST /ranges/${RANGE_ID}/counter/ball-credit/redeem`]: (body: any) => {
        if (body.bucketProductId === 'p-large' && credit < 150) return { status: 409, json: { error: { code: 'not_enough_credit', message: 'Large bucket needs 150 balls of credit; you have 50.' } } };
        credit -= body.bucketProductId === 'p-large' ? 150 : 100;
        const code = { id: 'c', code: 'ABCD-EFGH', rangeId: RANGE_ID, bucket: { productId: body.bucketProductId, name: 'Large bucket', balls: 150 }, orderId: 'o5', accountId: 'a7', createdAt: '2026-11-23T22:00:00.000Z', redeemedAt: '2026-11-23T22:00:00.000Z' };
        return { status: 201, json: { order: order({ id: 'o5', kind: 'bucket', totalCents: 0, paymentProvider: 'ball_credit' }), bucketCode: code, ballCredit: credit } };
      },
      [`GET /ranges/${RANGE_ID}/passes`]: () => ({ json: { passes: [], ballCredit: [{ account: holder, balls: credit }] } }),
    });
    const done = await api.redeemBallCredit('credit-a7', 'large');
    expect(done).toMatchObject({ ok: true, value: { pass: { player: 'Grace Tan', ballsLeft: 350 }, order: { bucket: 'large', balls: 150, status: 'handed-over', amount: 0, passId: 'ball-credit' } } });
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ accountId: 'a7', bucketProductId: 'p-large' });
    credit = 50;
    expect(await api.redeemBallCredit('credit-a7', 'large')).toEqual({ ok: false, errors: ['Large bucket needs 150 balls of credit; you have 50.'] });
    expect((await api.redeemBallCredit('p9', 'small')).ok).toBe(false);
  });
});

describe('sessions', () => {
  it('sends the token, and calls back when the API no longer accepts it', async () => {
    const onUnauthorized = vi.fn();
    const { console: api, fetch } = make({ [`GET /ranges/${RANGE_ID}/fleet`]: () => ({ status: 401, json: { error: { code: 'unauthorized', message: 'Sign in first.' } } }) }, onUnauthorized);
    await expect(api.listRobots()).rejects.toThrow('Sign in first.');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' });
  });
});

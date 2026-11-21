import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const FOUR_PM = '2026-11-24T05:00:00.000Z'; // Tue 16:00 Sydney, peak
const TEN_AM = '2026-11-23T23:00:00.000Z'; // Tue 10:00 Sydney, off-peak

const book = (body: Record<string, unknown>, as = token) =>
  t.call('POST', '/bookings', { token: as, body: { bayId: bays[0].id, startsAt: FOUR_PM, paymentMethod: 'pm_fake_ok', ...body } });

describe('booking a bay', () => {
  it('books and charges a peak hour', async () => {
    const res = await book({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      bay: { number: 1, name: 'Bay 1' },
      range: { slug: 'demo' },
      source: 'rangeops',
      startsAt: FOUR_PM,
      endsAt: '2026-11-24T06:00:00.000Z',
      hours: 1,
      status: 'confirmed',
      totalCents: 2800,
      currency: 'AUD',
      addOns: [],
    });
    expect(res.body.order).toMatchObject({ kind: 'booking', status: 'paid', totalCents: 2800, paymentProvider: 'fake' });
    expect(res.body.order.lines).toEqual([{ description: 'Bay 1, 16:00 peak', quantity: 1, unitCents: 2800 }]);
    expect(t.payments.charges.size).toBe(1);
  });

  it('prices bay-hours plus club hire and a lesson', async () => {
    const res = await book({ hours: 2, addOns: [{ kind: 'club_hire', quantity: 2 }, { kind: 'lesson' }] });
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(2800 * 2 + 1000 * 2 + 7000);
    expect(res.body.addOns).toEqual([
      { kind: 'club_hire', quantity: 2, priceCents: 2000 },
      { kind: 'lesson', quantity: 1, priceCents: 7000 },
    ]);
    expect(res.body.order.lines.map((l: any) => l.description)).toEqual(['Bay 1, 16:00 peak', 'Bay 1, 17:00 peak', 'Club hire', 'Lesson']);
  });

  it('mixes peak and off-peak across a booking', async () => {
    const res = await book({ startsAt: '2026-11-24T03:00:00.000Z', hours: 3 }); // 14:00–17:00
    expect(res.body.totalCents).toBe(1800 + 1800 + 2800);
  });

  it('refuses a bay that is already booked', async () => {
    expect((await book({ hours: 2 })).status).toBe(201);
    const other = await t.signIn('other@example.com');
    const clash = await book({ startsAt: '2026-11-24T06:00:00.000Z' }, other);
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('bay_taken');
    expect((await book({ bayId: bays[1].id }, other)).status).toBe(201);
  });

  it('leaves the slot free when the card is declined', async () => {
    const declined = await book({ paymentMethod: 'pm_fake_declined' });
    expect(declined.status).toBe(402);
    expect(declined.body.error).toEqual({ code: 'payment_declined', message: 'Your card was declined.' });
    expect((await book({})).status).toBe(201);
    const mine = await t.call('GET', '/me/bookings', { token });
    expect(mine.body.bookings.map((b: any) => b.status).sort()).toEqual(['cancelled', 'confirmed']);
  });

  it('needs a payment method for a paid booking', async () => {
    const res = await book({ paymentMethod: undefined });
    expect(res.status).toBe(402);
  });

  it.each([
    ['not on the hour', { startsAt: '2026-11-24T05:30:00.000Z' }, 'not_on_the_hour'],
    ['in the past', { startsAt: '2026-11-23T21:00:00.000Z' }, 'in_the_past'],
    ['after closing', { startsAt: '2026-11-24T10:00:00.000Z', hours: 2 }, 'outside_opening_hours'], // 21:00–23:00
    ['before opening', { startsAt: '2026-11-24T19:00:00.000Z' }, 'outside_opening_hours'], // Wed 06:00
    ['too many clubs', { addOns: [{ kind: 'club_hire', quantity: 5 }] }, 'bad_request'],
    ['two robots', { addOns: [{ kind: 'robot', quantity: 2 }] }, 'bad_quantity'],
    ['a repeated add-on', { addOns: [{ kind: 'lesson' }, { kind: 'lesson' }] }, 'duplicate_add_on'],
    ['an unknown add-on', { addOns: [{ kind: 'caddie' }] }, 'bad_request'],
    ['five hours', { hours: 5 }, 'bad_request'],
  ])('refuses a booking %s', async (_name, body, code) => {
    const res = await book(body);
    expect(res.body.error.code).toBe(code);
    expect([400, 422]).toContain(res.status);
  });

  it('refuses an inactive bay', async () => {
    await t.deps.db.many('update bays set active = false where id = $1', [bays[0].id]);
    const res = await book({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('bay_inactive');
  });

  it('needs a session', async () => {
    const res = await t.call('POST', '/bookings', { body: { bayId: bays[0].id, startsAt: FOUR_PM } });
    expect(res.status).toBe(401);
  });

  it('shows the booking as taken in availability', async () => {
    await book({ hours: 2 });
    const day = await t.call('GET', '/ranges/demo/availability?date=2026-11-24');
    const slots = day.body.bays[0].slots;
    expect(slots.filter((s: any) => !s.free).map((s: any) => s.localTime)).toEqual(['16:00', '17:00']);
    expect(day.body.bays[1].slots.every((s: any) => s.free)).toBe(true);
  });
});

describe('seeing bookings', () => {
  it('lists your bookings newest first and hides them from others', async () => {
    const a = await book({ startsAt: TEN_AM });
    const b = await book({});
    const mine = await t.call('GET', '/me/bookings', { token });
    expect(mine.body.bookings.map((x: any) => x.id)).toEqual([b.body.id, a.body.id]);

    expect((await t.call('GET', `/bookings/${a.body.id}`, { token })).status).toBe(200);
    const other = await t.signIn('other@example.com');
    expect((await t.call('GET', `/bookings/${a.body.id}`, { token: other })).status).toBe(404);
    expect((await t.call('GET', '/me/bookings', { token: other })).body.bookings).toEqual([]);
  });

  it('lets range staff see any booking at their range', async () => {
    const a = await book({});
    const staff = await t.signIn('staff@rangeops.test');
    expect((await t.call('GET', `/bookings/${a.body.id}`, { token: staff })).status).toBe(200);
  });
});

describe('cancelling', () => {
  it('refunds and frees the slot', async () => {
    const a = await book({});
    const res = await t.call('POST', `/bookings/${a.body.id}/cancel`, { token });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.order.status).toBe('refunded');
    const charge = [...t.payments.charges.values()][0]!;
    expect(charge.refundedCents).toBe(2800);
    expect((await book({})).status).toBe(201);
    expect((await t.call('POST', `/bookings/${a.body.id}/cancel`, { token })).status).toBe(409);
  });

  it('lets only staff cancel once it has started', async () => {
    const a = await book({ startsAt: TEN_AM });
    t.clock.set('2026-11-23T23:10:00Z');
    const res = await t.call('POST', `/bookings/${a.body.id}/cancel`, { token });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('already_started');
    const staff = await t.signIn('staff@rangeops.test');
    expect((await t.call('POST', `/bookings/${a.body.id}/cancel`, { token: staff })).status).toBe(200);
  });
});

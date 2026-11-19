// Behaviour every ConsoleApi must have, whatever is behind it. The fake runs these in
// FakeConsoleApi.test.ts; ticket 11 runs them against the real API too.
import { describe, expect, it } from 'vitest';
import type { Clock, ConsoleApi } from './ConsoleApi';
import { toIsoDate } from '../domain/time';

export function consoleApiContract(name: string, make: () => { api: ConsoleApi; clock: Clock }) {
  describe(`${name} meets the ConsoleApi contract`, () => {
    const { capabilities } = make().api;
    it('returns a range with uniquely numbered bays and seven days of hours', async () => {
      const { api } = make();
      const setup = await api.getSetup();
      expect(setup.bays.length).toBeGreaterThan(0);
      expect(new Set(setup.bays.map((b) => b.number)).size).toBe(setup.bays.length);
      expect(setup.openingHours).toHaveLength(7);
    });

    it('returns copies, so changing what it returned changes nothing', async () => {
      const { api } = make();
      const setup = await api.getSetup();
      setup.bays[0].name = 'Changed by a screen';
      expect((await api.getSetup()).bays[0].name).not.toBe('Changed by a screen');
    });

    it('refuses a setup that does not validate, and keeps the old one', async () => {
      const { api } = make();
      const setup = await api.getSetup();
      const before = setup.prices.bands.standard.offPeak;
      setup.prices.bands.standard.offPeak = setup.prices.bands.standard.floor - 100;
      const result = await api.saveSetup(setup);
      expect(result.ok).toBe(false);
      expect((await api.getSetup()).prices.bands.standard.offPeak).toBe(before);
    });

    it('lists bookings for a day in start order', async () => {
      const { api, clock } = make();
      const bookings = await api.listBookings(toIsoDate(clock()));
      const starts = bookings.map((b) => b.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('checks a booking in once, and refunds a cancelled one', async () => {
      const { api, clock } = make();
      const today = toIsoDate(clock());
      const [first, second] = (await api.listBookings(today)).filter((b) => b.status === 'booked');
      expect(second).toBeDefined();

      expect((await api.setBookingStatus(first.id, 'checked-in')).ok).toBe(true);
      expect((await api.setBookingStatus(first.id, 'checked-in')).ok).toBe(false);

      const before = (await api.listPayments(today)).reduce((sum, p) => sum + p.amount, 0);
      expect((await api.setBookingStatus(second.id, 'cancelled')).ok).toBe(true);
      const after = (await api.listPayments(today)).reduce((sum, p) => sum + p.amount, 0);
      expect(after).toBe(before - second.amount);
    });

    it('hands over a paid bucket once, and refuses unknown codes', async () => {
      const { api, clock } = make();
      const paid = (await api.listOrders(toIsoDate(clock()))).find((o) => o.status === 'paid');
      expect(paid).toBeDefined();
      const typed = paid!.code.toLowerCase().replace(/(...)/, '$1-');
      expect(await api.handOverBucket(typed)).toMatchObject({ outcome: 'handed-over', order: { id: paid!.id } });
      expect((await api.handOverBucket(paid!.code)).outcome).toBe('already-handed-over');
      const listed = (await api.listOrders(toIsoDate(clock()))).find((o) => o.id === paid!.id);
      expect(listed?.status).toBe('handed-over');
      expect((await api.handOverBucket('ZZZZ22')).outcome).toBe('not-found');
    });

    it.skipIf(!capabilities.sellPasses || !capabilities.redeemPasses)('sells a credit pack, takes the money, and redeems its credits until none are left', async () => {
      const { api, clock } = make();
      const today = toIsoDate(clock());
      const { prices } = await api.getSetup();
      const takenBefore = (await api.listPayments(today)).reduce((sum, p) => sum + p.amount, 0);
      const sold = await api.sellPass('Contract Tester', 'credits');
      if (!sold.ok) throw new Error(sold.errors.join());
      const takenAfter = (await api.listPayments(today)).reduce((sum, p) => sum + p.amount, 0);
      expect(takenAfter - takenBefore).toBe(prices.creditPack.price);
      for (let i = 0; i < prices.creditPack.credits; i += 1) {
        const redeemed = await api.redeemPassBucket(sold.value.id);
        expect(redeemed.ok).toBe(true);
      }
      expect((await api.redeemPassBucket(sold.value.id)).ok).toBe(false);
      expect((await api.listPasses()).find((p) => p.id === sold.value.id)?.redemptions).toHaveLength(prices.creditPack.credits);
    });
  });
}

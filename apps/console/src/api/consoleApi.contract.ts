// Behaviour every ConsoleApi must have, whatever is behind it. The fake runs these in
// FakeConsoleApi.test.ts; ticket 11 runs them against the real API too.
import { describe, expect, it } from 'vitest';
import type { Clock, ConsoleApi } from './ConsoleApi';
import { toIsoDate } from '../domain/time';

export function consoleApiContract(name: string, make: () => { api: ConsoleApi; clock: Clock }) {
  describe(`${name} meets the ConsoleApi contract`, () => {
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
  });
}

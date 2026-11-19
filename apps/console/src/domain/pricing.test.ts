import { describe, expect, it } from 'vitest';
import { bayHourPrice, clampToFloor, isPeak, quoteBooking, validateOpeningHours, validatePrices } from './pricing';
import type { Bay, OpeningHours, PriceList } from './types';

// Weekdays 7 to 22, weekends 6 to 22. Peak is weekday evenings 16 to 21 and weekend mornings 8 to 12.
const hours: OpeningHours = [
  { open: 6, close: 22 },
  { open: 7, close: 22 },
  { open: 7, close: 22 },
  { open: 7, close: 22 },
  { open: 7, close: 22 },
  { open: 7, close: 22 },
  { open: 6, close: 22 },
];

const prices: PriceList = {
  bands: {
    standard: { offPeak: 2400, peak: 3200, floor: 1800 },
    premium: { offPeak: 3400, peak: 4400, floor: 2600 },
  },
  peakWindows: [
    { days: [1, 2, 3, 4, 5], start: 16, end: 21 },
    { days: [0, 6], start: 8, end: 12 },
  ],
  robotHirePerHour: 1500,
  buckets: { small: 800, medium: 1400, large: 1900 },
  monthlyPass: { price: 9900, bucketsPerMonth: 8, bayHoursPerMonth: 4, months: 1 },
  creditPack: { price: 6000, credits: 5 },
};

const bay: Bay = { id: 'bay-7', number: 7, name: 'Bay 7', band: 'standard', inService: true };
const premiumBay: Bay = { ...bay, id: 'bay-2', number: 2, band: 'premium' };

// 2026-11-19 is a Thursday; 2026-11-21 is a Saturday.
const THURSDAY = '2026-11-19';
const SATURDAY = '2026-11-21';

describe('isPeak', () => {
  it('is peak inside a window and off-peak outside it', () => {
    expect(isPeak(prices, 4, 15)).toBe(false);
    expect(isPeak(prices, 4, 16)).toBe(true);
    expect(isPeak(prices, 4, 20)).toBe(true);
    expect(isPeak(prices, 4, 21)).toBe(false);
  });

  it('uses the weekend window on weekends', () => {
    expect(isPeak(prices, 6, 9)).toBe(true);
    expect(isPeak(prices, 6, 17)).toBe(false);
    expect(isPeak(prices, 0, 11)).toBe(true);
  });
});

describe('bayHourPrice', () => {
  it('charges the band price for the hour', () => {
    expect(bayHourPrice(prices, 'standard', THURSDAY, 10)).toEqual({ hour: 10, peak: false, price: 2400 });
    expect(bayHourPrice(prices, 'standard', THURSDAY, 18)).toEqual({ hour: 18, peak: true, price: 3200 });
    expect(bayHourPrice(prices, 'premium', THURSDAY, 18).price).toBe(4400);
  });
});

describe('quoteBooking', () => {
  it('prices each hour on its own when a booking straddles the peak boundary', () => {
    const quote = quoteBooking({ prices, openingHours: hours, bay, date: THURSDAY, start: 15, hours: 3, robotHire: false });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.value.lines.map((l) => [l.hour, l.peak, l.price])).toEqual([
      [15, false, 2400],
      [16, true, 3200],
      [17, true, 3200],
    ]);
    expect(quote.value.bayTotal).toBe(8800);
    expect(quote.value.robotTotal).toBe(0);
    expect(quote.value.total).toBe(8800);
  });

  it('adds the robot hire per hour', () => {
    const quote = quoteBooking({ prices, openingHours: hours, bay: premiumBay, date: SATURDAY, start: 11, hours: 2, robotHire: true });
    expect(quote.ok && quote.value).toMatchObject({ bayTotal: 4400 + 3400, robotTotal: 3000, total: 10800 });
  });

  it('refuses hours outside opening hours', () => {
    const early = quoteBooking({ prices, openingHours: hours, bay, date: THURSDAY, start: 6, hours: 1, robotHire: false });
    expect(early).toEqual({ ok: false, errors: ['The range is open 07:00 to 22:00 on Thursday.'] });
    const late = quoteBooking({ prices, openingHours: hours, bay, date: THURSDAY, start: 21, hours: 2, robotHire: false });
    expect(late.ok).toBe(false);
    expect(quoteBooking({ prices, openingHours: hours, bay, date: SATURDAY, start: 6, hours: 1, robotHire: false }).ok).toBe(true);
  });

  it('refuses closed days, bays out of service and empty bookings', () => {
    const closed = hours.map((h, i) => (i === 4 ? null : h));
    expect(quoteBooking({ prices, openingHours: closed, bay, date: THURSDAY, start: 10, hours: 1, robotHire: false })).toEqual({
      ok: false,
      errors: ['The range is closed on Thursday.'],
    });
    expect(quoteBooking({ prices, openingHours: hours, bay: { ...bay, inService: false }, date: THURSDAY, start: 10, hours: 1, robotHire: false }).ok).toBe(false);
    expect(quoteBooking({ prices, openingHours: hours, bay, date: THURSDAY, start: 10, hours: 0, robotHire: false }).ok).toBe(false);
  });
});

describe('validatePrices', () => {
  it('accepts a sound price list', () => {
    expect(validatePrices(prices, hours)).toEqual([]);
  });

  it('refuses prices below the floor', () => {
    const low = { ...prices, bands: { ...prices.bands, standard: { offPeak: 1500, peak: 3200, floor: 1800 } } };
    expect(validatePrices(low, hours)).toEqual(['Standard off-peak ($15.00) is below its floor ($18.00).']);
    const lowPeak = { ...prices, bands: { ...prices.bands, premium: { offPeak: 3400, peak: 2000, floor: 2600 } } };
    expect(validatePrices(lowPeak, hours)).toEqual(['Premium peak ($20.00) is below its floor ($26.00).']);
  });

  it('refuses peak windows outside opening hours', () => {
    const early = { ...prices, peakWindows: [{ days: [1 as const], start: 5, end: 9 }] };
    expect(validatePrices(early, hours)).toEqual(['A peak window on Monday (05:00 to 09:00) falls outside opening hours (07:00 to 22:00).']);
    const closedSunday = hours.map((h, i) => (i === 0 ? null : h));
    expect(validatePrices(prices, closedSunday)).toEqual(['A peak window falls on Sunday, when the range is closed.']);
    const backwards = { ...prices, peakWindows: [{ days: [2 as const], start: 18, end: 16 }] };
    expect(validatePrices(backwards, hours)).toEqual(['A peak window must end after it starts.']);
  });

  it('refuses negative or fractional amounts', () => {
    expect(validatePrices({ ...prices, robotHirePerHour: -1 }, hours)).toEqual(['Robot hire per hour must be a whole number of cents, zero or more.']);
    expect(validatePrices({ ...prices, creditPack: { price: 6000, credits: 0 } }, hours)).toEqual(['A credit pack must hold at least one bucket.']);
  });
});

describe('validateOpeningHours', () => {
  it('needs seven days, each opening before it closes', () => {
    expect(validateOpeningHours(hours)).toEqual([]);
    expect(validateOpeningHours(hours.slice(0, 6))).toEqual(['Opening hours need all seven days.']);
    const bad = hours.map((h, i) => (i === 3 ? { open: 22, close: 7 } : h));
    expect(validateOpeningHours(bad)).toEqual(['Wednesday must close after it opens.']);
  });
});

describe('clampToFloor', () => {
  it('never lets demand pricing go under the floor', () => {
    expect(clampToFloor(1200, 1800)).toBe(1800);
    expect(clampToFloor(2600, 1800)).toBe(2600);
  });
});

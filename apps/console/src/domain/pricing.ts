// Bay pricing: each bay-hour is priced on its own, at the peak or off-peak price for the bay's band.
// The floor is the least a bay-hour may ever cost; set prices can't go under it, and demand pricing
// (later) is clamped to it.
import { formatMoney } from './money';
import { hourLabel, weekdayOf, WEEKDAY_NAMES } from './time';
import type { Bay, Cents, IsoDate, OpeningHours, PriceBand, PriceList, Result, Weekday } from './types';

export interface QuoteLine {
  hour: number;
  peak: boolean;
  price: Cents;
}

export interface Quote {
  lines: QuoteLine[];
  bayTotal: Cents;
  robotTotal: Cents;
  total: Cents;
}

export interface QuoteRequest {
  prices: PriceList;
  openingHours: OpeningHours;
  bay: Bay;
  date: IsoDate;
  start: number;
  hours: number;
  robotHire: boolean;
}

export function isPeak(prices: PriceList, weekday: Weekday, hour: number): boolean {
  return prices.peakWindows.some((w) => w.days.includes(weekday) && hour >= w.start && hour < w.end);
}

export function bayHourPrice(prices: PriceList, band: PriceBand, date: IsoDate, hour: number): QuoteLine {
  const peak = isPeak(prices, weekdayOf(date), hour);
  const bandPrices = prices.bands[band];
  return { hour, peak, price: peak ? bandPrices.peak : bandPrices.offPeak };
}

export function quoteBooking(req: QuoteRequest): Result<Quote> {
  const { prices, openingHours, bay, date, start, hours, robotHire } = req;
  const weekday = weekdayOf(date);
  const open = openingHours[weekday];
  if (!bay.inService) return fail(`${bay.name} is out of service.`);
  if (!Number.isInteger(hours) || hours < 1) return fail('A booking is at least one whole hour.');
  if (!open) return fail(`The range is closed on ${WEEKDAY_NAMES[weekday]}.`);
  if (start < open.open || start + hours > open.close) {
    return fail(`The range is open ${hourLabel(open.open)} to ${hourLabel(open.close)} on ${WEEKDAY_NAMES[weekday]}.`);
  }
  const lines = Array.from({ length: hours }, (_, i) => bayHourPrice(prices, bay.band, date, start + i));
  const bayTotal = lines.reduce((sum, line) => sum + line.price, 0);
  const robotTotal = robotHire ? prices.robotHirePerHour * hours : 0;
  return { ok: true, value: { lines, bayTotal, robotTotal, total: bayTotal + robotTotal } };
}

export function clampToFloor(price: Cents, floor: Cents): Cents {
  return Math.max(price, floor);
}

export function validateOpeningHours(openingHours: OpeningHours): string[] {
  if (openingHours.length !== 7) return ['Opening hours need all seven days.'];
  const errors: string[] = [];
  openingHours.forEach((day, i) => {
    if (!day) return;
    const valid = [day.open, day.close].every((h) => Number.isInteger(h) && h >= 0 && h <= 24);
    if (!valid) errors.push(`${WEEKDAY_NAMES[i]} hours must be whole hours from 0 to 24.`);
    else if (day.close <= day.open) errors.push(`${WEEKDAY_NAMES[i]} must close after it opens.`);
  });
  return errors;
}

export function validatePrices(prices: PriceList, openingHours: OpeningHours): string[] {
  const errors: string[] = [];
  const amount = (label: string, value: Cents) => {
    if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a whole number of cents, zero or more.`);
  };

  for (const band of ['standard', 'premium'] as const) {
    const { offPeak, peak, floor } = prices.bands[band];
    const name = band === 'standard' ? 'Standard' : 'Premium';
    amount(`${name} floor`, floor);
    amount(`${name} off-peak`, offPeak);
    amount(`${name} peak`, peak);
    if (offPeak < floor) errors.push(`${name} off-peak (${formatMoney(offPeak)}) is below its floor (${formatMoney(floor)}).`);
    if (peak < floor) errors.push(`${name} peak (${formatMoney(peak)}) is below its floor (${formatMoney(floor)}).`);
  }

  for (const window of prices.peakWindows) {
    if (window.end <= window.start) {
      errors.push('A peak window must end after it starts.');
      continue;
    }
    for (const day of window.days) {
      const open = openingHours[day];
      if (!open) errors.push(`A peak window falls on ${WEEKDAY_NAMES[day]}, when the range is closed.`);
      else if (window.start < open.open || window.end > open.close) {
        errors.push(
          `A peak window on ${WEEKDAY_NAMES[day]} (${hourLabel(window.start)} to ${hourLabel(window.end)}) falls outside opening hours (${hourLabel(open.open)} to ${hourLabel(open.close)}).`,
        );
      }
    }
  }

  amount('Robot hire per hour', prices.robotHirePerHour);
  for (const size of ['small', 'medium', 'large'] as const) amount(`A ${size} bucket`, prices.buckets[size]);
  amount('The monthly pass', prices.monthlyPass.price);
  amount('The credit pack', prices.creditPack.price);
  if (prices.creditPack.balls === undefined && (!Number.isInteger(prices.creditPack.credits) || prices.creditPack.credits < 1)) {
    errors.push('A credit pack must hold at least one bucket.');
  }
  const { bucketsPerMonth, bayHoursPerMonth, months } = prices.monthlyPass;
  if (![bucketsPerMonth, bayHoursPerMonth].every((n) => Number.isInteger(n) && n >= 0)) {
    errors.push('Monthly pass allowances must be whole numbers, zero or more.');
  }
  if (!Number.isInteger(months) || months < 1) errors.push('A monthly pass runs for at least one month.');
  return errors;
}

function fail<T>(message: string): Result<T> {
  return { ok: false, errors: [message] };
}

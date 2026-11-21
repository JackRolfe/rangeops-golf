import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, dateTimeAt, hourOf, minutesBetween, weekdayOf } from './time';
import { dollarsToCents, formatMoney } from './money';

describe('time', () => {
  it('works in local dates', () => {
    expect(weekdayOf('2026-11-19')).toBe(4);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(dateTimeAt('2026-11-19', 7)).toBe('2026-11-19T07:00');
    expect(addMinutes('2026-11-19T23:30', 45)).toBe('2026-11-20T00:15');
    expect(minutesBetween('2026-11-19T10:00', '2026-11-19T11:30')).toBe(90);
    expect(hourOf('2026-11-19T14:30')).toBe(14.5);
  });
});

describe('money', () => {
  it('formats and parses Australian dollars', () => {
    expect(formatMoney(2450)).toBe('$24.50');
    expect(dollarsToCents('24.5')).toBe(2450);
    expect(dollarsToCents('$30')).toBe(3000);
    expect(dollarsToCents('abc')).toBeNaN();
  });
});

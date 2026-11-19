import { describe, expect, it } from 'vitest';
import { hhmmToMinutes, isCalendarDate, localDate, localParts, minutesToHhmm, weekdayOf, zonedInstant } from './time.js';

const SYD = 'Australia/Sydney';

describe('time zones', () => {
  it('turns Sydney wall-clock times into instants, summer and winter', () => {
    expect(zonedInstant('2026-11-24', 9 * 60, SYD).toISOString()).toBe('2026-11-23T22:00:00.000Z'); // AEDT +11
    expect(zonedInstant('2026-06-15', 9 * 60, SYD).toISOString()).toBe('2026-06-14T23:00:00.000Z'); // AEST +10
  });

  it('handles the daylight-saving days', () => {
    // 4 Oct 2026: 02:00 jumps to 03:00. 07:00 is +11 already.
    expect(zonedInstant('2026-10-04', 7 * 60, SYD).toISOString()).toBe('2026-10-03T20:00:00.000Z');
    expect(zonedInstant('2026-10-04', 1 * 60, SYD).toISOString()).toBe('2026-10-03T15:00:00.000Z');
    // 5 Apr 2026: 03:00 falls back to 02:00. 07:00 is +10.
    expect(zonedInstant('2026-04-05', 7 * 60, SYD).toISOString()).toBe('2026-04-04T21:00:00.000Z');
  });

  it('reads local parts and dates back', () => {
    const p = localParts(new Date('2026-11-23T22:00:00Z'), SYD);
    expect(p).toMatchObject({ year: 2026, month: 11, day: 24, hour: 9, minute: 0, weekday: 2 });
    expect(localDate(new Date('2026-11-23T12:59:00Z'), SYD)).toBe('2026-11-23');
    expect(localDate(new Date('2026-11-23T13:00:00Z'), SYD)).toBe('2026-11-24');
  });

  it('converts helpers', () => {
    expect(weekdayOf('2026-11-24')).toBe(2);
    expect(minutesToHhmm(1440)).toBe('24:00');
    expect(hhmmToMinutes('16:30')).toBe(990);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-02-28')).toBe(true);
  });
});

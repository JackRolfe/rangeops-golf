import type { BayRow, PeakRow, RangeData } from './ranges/repo.js';
import { HOUR_MS, localParts, weekdayOf, zonedInstant } from './time.js';

export interface HourSlot {
  startsAt: Date;
  endsAt: Date;
  /** Local start time, minutes after midnight. */
  localMinutes: number;
  weekday: number;
  onTheHour: boolean;
  /** The whole hour is inside the range's opening hours. */
  open: boolean;
  peak: boolean;
  priceCents: number;
}

export function isPeak(peaks: PeakRow[], weekday: number, minutes: number): boolean {
  return peaks.some((w) => w.weekday === weekday && w.from_min <= minutes && minutes < w.to_min);
}

/** Price of one bay-hour: the bay's own price if set, else the range's; peak or off-peak by its start; never under the floor. */
export function bayHourCents(data: RangeData, bay: BayRow, peak: boolean): number {
  const price = peak ? (bay.peak_cents ?? data.range.peak_cents) : (bay.off_peak_cents ?? data.range.off_peak_cents);
  return Math.max(price, data.range.floor_cents);
}

/** Everything about the bay-hour that starts at an instant. */
export function hourSlot(data: RangeData, bay: BayRow, startsAt: Date): HourSlot {
  const p = localParts(startsAt, data.range.time_zone);
  const localMinutes = p.hour * 60 + p.minute;
  const onTheHour = p.minute === 0 && p.second === 0 && startsAt.getUTCMilliseconds() === 0;
  const day = data.hours.find((h) => h.weekday === p.weekday);
  const open = !!day && day.opens_min <= localMinutes && localMinutes + 60 <= day.closes_min;
  const peak = isPeak(data.peaks, p.weekday, localMinutes);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR_MS),
    localMinutes,
    weekday: p.weekday,
    onTheHour,
    open,
    peak,
    priceCents: bayHourCents(data, bay, peak),
  };
}

/** The start instants of each whole open hour on a local calendar date. */
export function openHourStarts(data: RangeData, date: string): Date[] {
  const day = data.hours.find((h) => h.weekday === weekdayOf(date));
  if (!day) return [];
  const tz = data.range.time_zone;
  const starts: Date[] = [];
  for (let m = Math.ceil(day.opens_min / 60) * 60; m + 60 <= day.closes_min; m += 60) {
    const t = zonedInstant(date, m, tz);
    const p = localParts(t, tz);
    if (p.hour * 60 + p.minute !== m) continue; // skipped by a daylight-saving jump
    starts.push(t);
  }
  return starts;
}

export function percentOff(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

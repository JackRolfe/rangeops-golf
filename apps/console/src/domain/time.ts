import type { IsoDate, LocalDateTime, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): LocalDateTime {
  return `${toIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseLocal(value: IsoDate | LocalDateTime): Date {
  const [date, time = '00:00'] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}

export function dateTimeAt(date: IsoDate, hour: number, minute = 0): LocalDateTime {
  return toLocalDateTime(new Date(...ymd(date), hour, minute));
}

export function weekdayOf(date: IsoDate): Weekday {
  return new Date(...ymd(date)).getDay() as Weekday;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = ymd(date);
  return toIsoDate(new Date(y, m, d + days));
}

export function addMinutes(at: LocalDateTime, minutes: number): LocalDateTime {
  return toLocalDateTime(new Date(parseLocal(at).getTime() + minutes * 60_000));
}

export function minutesBetween(from: LocalDateTime, to: LocalDateTime): number {
  return Math.round((parseLocal(to).getTime() - parseLocal(from).getTime()) / 60_000);
}

export function monthOf(value: IsoDate | LocalDateTime): string {
  return value.slice(0, 7);
}

export function dateOf(at: LocalDateTime): IsoDate {
  return at.slice(0, 10);
}

/** Hours since midnight as a fraction, e.g. 14:30 is 14.5. */
export function hourOf(at: LocalDateTime): number {
  const [h, m] = at.slice(11, 16).split(':').map(Number);
  return h + m / 60;
}

export function hourLabel(hour: number): string {
  return `${pad(hour)}:00`;
}

export function timeLabel(at: LocalDateTime): string {
  return at.slice(11, 16);
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymd(date: IsoDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m - 1, d];
}

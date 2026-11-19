/** Dates and times at a range, in the range's own time zone, with only Intl. */

export interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0 Sunday to 6 Saturday, as the API counts. */
  weekday: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone)
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    })
    formatters.set(timeZone, found)
  }
  return found
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** The local date, YYYY-MM-DD, of an instant at a range. */
export function localDate(instant: Date, timeZone: string): string {
  const { year, month, day } = localParts(instant, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** The instant a local date and time (HH:MM) happens at a range. */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wanted = Date.UTC(year, month - 1, day, hour, minute)
  let guess = wanted
  // Twice is enough to settle across a daylight-saving change.
  for (let pass = 0; pass < 2; pass++) {
    const seen = localParts(new Date(guess), timeZone)
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    guess += wanted - seenAsUtc
  }
  return new Date(guess)
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

/** 0 Sunday to 6 Saturday, for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function localTime(instant: Date, timeZone: string): string {
  const { hour, minute } = localParts(instant, timeZone)
  return `${pad(hour)}:${pad(minute)}`
}

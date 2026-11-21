import { localTime } from '../domain/zonedTime'

/** "Thu 4 Dec, 11:00–12:00", at the range. */
export function formatBookingTime(startsAt: string, endsAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
    .format(new Date(startsAt))
    .replace(',', '')
  return `${day}, ${localTime(new Date(startsAt), timeZone)}–${localTime(new Date(endsAt), timeZone)}`
}

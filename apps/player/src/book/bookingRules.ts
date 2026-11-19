import type { AddOnKind, AddOnPrice, Availability, Range, Slot } from '../api/types'
import { addDays, localDate } from '../domain/zonedTime'

/** The longest booking the API takes. */
export const MAX_BOOKING_HOURS = 4
export const BOOKING_DAYS_AHEAD = 14

export interface DayChoice {
  date: string
  label: string
}

/** Today and the next 13 days at the range, labelled for a child to read. */
export function bookingDays(timeZone: string, now = new Date()): DayChoice[] {
  const today = localDate(now, timeZone)
  const format = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return Array.from({ length: BOOKING_DAYS_AHEAD }, (_, index) => {
    const date = addDays(today, index)
    const [year, month, day] = date.split('-').map(Number)
    const label = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : format.format(new Date(Date.UTC(year, month - 1, day))).replace(',', '')
    return { date, label }
  })
}

/** The bay's run of `hours` slots starting at `index`, if all are free and not yet started. */
function freeRun(slots: Slot[], index: number, hours: number, now: Date): Slot[] | null {
  const run = slots.slice(index, index + hours)
  if (run.length < hours) return null
  if (Date.parse(run[0].startsAt) < now.getTime()) return null
  return run.every((slot) => slot.free) ? run : null
}

export interface StartTime {
  startsAt: string
  localTime: string
  peak: boolean
  /** Free bays for the whole booking. */
  bays: { bayId: string; number: number; name: string; priceCents: number }[]
  /** Robots free for every hour of it. */
  robotsFree: number
}

/** Start times with at least one bay free for `hours` hours. */
export function startTimes(availability: Availability, hours: number, now = new Date()): StartTime[] {
  return availability.hours
    .map((hour, index) => {
      const bays = availability.bays.flatMap((bay) => {
        const run = freeRun(bay.slots, index, hours, now)
        return run ? [{ bayId: bay.bayId, number: bay.number, name: bay.name, priceCents: run.reduce((sum, slot) => sum + slot.priceCents, 0) }] : []
      })
      const robotHours = availability.hours.slice(index, index + hours)
      return {
        startsAt: hour.startsAt,
        localTime: hour.localTime,
        peak: availability.bays.some((bay) => bay.slots[index]?.peak),
        bays,
        robotsFree: robotHours.length === hours ? Math.min(...robotHours.map((item) => item.robotsFree)) : 0,
      }
    })
    .filter((time) => time.bays.length > 0)
}

export function addOnPrice(addOn: AddOnPrice, hours: number, quantity = 1): number {
  return addOn.priceCents * quantity * (addOn.unit === 'per_hour' ? hours : 1)
}

/** What the app expects the API to charge, before any pass discount. */
export function estimateCents(bayCents: number, addOns: AddOnKind[], range: Pick<Range, 'addOns'>, hours: number): number {
  return addOns.reduce((sum, kind) => {
    const price = range.addOns.find((item) => item.kind === kind)
    return price ? sum + addOnPrice(price, hours) : sum
  }, bayCents)
}

export const ADD_ON_LABELS: Record<AddOnKind, { name: string; detail: string }> = {
  robot: { name: 'Mulligan robot', detail: 'Fetches your short shots' },
  club_hire: { name: 'Club hire', detail: 'A set of clubs at the bay' },
  lesson: { name: 'Lesson', detail: 'With the range’s coach' },
}

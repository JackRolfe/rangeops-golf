import { describe, expect, it } from 'vitest'
import type { Availability } from '../api/types'
import { bookingDays, estimateCents, startTimes } from './bookingRules'

const slot = (hour: number, free: boolean, peak = false) => ({
  startsAt: `2026-12-03T${String(hour).padStart(2, '0')}:00:00.000Z`,
  endsAt: `2026-12-03T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
  localTime: `${hour}:00`,
  peak,
  priceCents: peak ? 2600 : 1800,
  free,
})

const availability: Availability = {
  rangeId: 'r',
  date: '2026-12-03',
  timeZone: 'UTC',
  hours: [9, 10, 11, 12].map((hour, index) => ({ startsAt: slot(hour, true).startsAt, localTime: `${hour}:00`, robotsFree: [2, 0, 1, 1][index] })),
  bays: [
    { bayId: 'b1', number: 1, name: 'Bay 1', slots: [slot(9, true), slot(10, false), slot(11, true), slot(12, true, true)] },
    { bayId: 'b2', number: 2, name: 'Bay 2', slots: [slot(9, false), slot(10, true), slot(11, true), slot(12, false)] },
  ],
}

describe('startTimes', () => {
  it('offers a time when some bay is free for every hour of the booking', () => {
    const now = new Date('2026-12-03T00:00:00.000Z')
    expect(startTimes(availability, 1, now).map((time) => [time.localTime, time.bays.map((bay) => bay.number)])).toEqual([
      ['9:00', [1]],
      ['10:00', [2]],
      ['11:00', [1, 2]],
      ['12:00', [1]],
    ])
    expect(startTimes(availability, 2, now).map((time) => [time.localTime, time.bays.map((bay) => bay.number)])).toEqual([
      ['10:00', [2]],
      ['11:00', [1]],
    ])
  })

  it('prices the run, counts robots free for all of it, and drops started hours', () => {
    const now = new Date('2026-12-03T10:30:00.000Z')
    const times = startTimes(availability, 2, now)
    expect(times).toHaveLength(1)
    expect(times[0]).toMatchObject({ localTime: '11:00', robotsFree: 1, bays: [{ number: 1, priceCents: 1800 + 2600 }] })
    expect(startTimes(availability, 2, new Date('2026-12-03T00:00:00.000Z'))[0].robotsFree).toBe(0)
  })
})

describe('estimateCents and bookingDays', () => {
  it('adds per-hour and per-booking add-ons', () => {
    const range = { addOns: [{ kind: 'robot' as const, priceCents: 1500, unit: 'per_hour' as const }, { kind: 'club_hire' as const, priceCents: 1000, unit: 'per_booking' as const }] }
    expect(estimateCents(3600, ['robot', 'club_hire'], range, 2)).toBe(3600 + 3000 + 1000)
  })

  it('labels today and tomorrow at the range', () => {
    const days = bookingDays('Australia/Sydney', new Date('2026-12-02T14:00:00.000Z')) // 01:00 on the 3rd in Sydney
    expect(days[0]).toEqual({ date: '2026-12-03', label: 'Today' })
    expect(days[1]).toEqual({ date: '2026-12-04', label: 'Tomorrow' })
    expect(days[2].label).toBe('Sat 5 Dec')
    expect(days).toHaveLength(14)
  })
})

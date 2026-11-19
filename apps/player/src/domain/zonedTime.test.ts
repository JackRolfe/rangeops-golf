import { describe, expect, it } from 'vitest'
import { addDays, localDate, localParts, localTime, weekdayOf, zonedTime } from './zonedTime'

const SYDNEY = 'Australia/Sydney'

describe('zoned time', () => {
  it('turns a Sydney date and time into an instant, either side of daylight saving', () => {
    expect(zonedTime('2026-07-01', '07:00', SYDNEY).toISOString()).toBe('2026-06-30T21:00:00.000Z') // AEST +10
    expect(zonedTime('2026-12-01', '07:00', SYDNEY).toISOString()).toBe('2026-11-30T20:00:00.000Z') // AEDT +11
  })

  it('reads an instant back as a Sydney date, time and weekday', () => {
    const instant = new Date('2026-11-30T20:00:00.000Z')
    expect(localDate(instant, SYDNEY)).toBe('2026-12-01')
    expect(localTime(instant, SYDNEY)).toBe('07:00')
    expect(localParts(instant, SYDNEY).weekday).toBe(2) // Tuesday
    expect(weekdayOf('2026-12-01')).toBe(2)
  })

  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

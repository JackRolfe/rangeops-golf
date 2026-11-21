import { describe, expect, it } from 'vitest';
import { hourSlot, openHourStarts, percentOff } from './pricing.js';
import type { BayRow, RangeData } from './ranges/repo.js';

const bay = (over: Partial<BayRow> = {}): BayRow => ({
  id: 'b', range_id: 'r', number: 1, name: 'Bay 1', active: true, off_peak_cents: null, peak_cents: null, check_in_code: 'x', ...over,
});

const data: RangeData = {
  range: { id: 'r', slug: 'x', name: 'X', time_zone: 'Australia/Sydney', currency: 'AUD', off_peak_cents: 1800, peak_cents: 2800, floor_cents: 0 },
  bays: [],
  hours: [{ weekday: 2, opens_min: 450, closes_min: 1320 }], // Tuesday 07:30–22:00
  peaks: [{ weekday: 2, from_min: 960, to_min: 1260 }],
  addOns: [],
  buckets: [],
  passProducts: [],
};

describe('pricing', () => {
  it("uses the bay's own prices over the range's", () => {
    const at4pm = new Date('2026-11-24T05:00:00Z'); // Tue 16:00 Sydney
    expect(hourSlot(data, bay(), at4pm)).toMatchObject({ peak: true, priceCents: 2800, open: true, onTheHour: true });
    expect(hourSlot(data, bay({ peak_cents: 3500 }), at4pm).priceCents).toBe(3500);
    const at10am = new Date('2026-11-23T23:00:00Z');
    expect(hourSlot(data, bay({ off_peak_cents: 1200 }), at10am)).toMatchObject({ peak: false, priceCents: 1200 });
  });

  it('only counts whole hours inside opening hours, starting on the hour', () => {
    expect(openHourStarts(data, '2026-11-24').map((d) => d.toISOString())[0]).toBe('2026-11-23T21:00:00.000Z'); // 08:00
    expect(openHourStarts(data, '2026-11-25')).toEqual([]); // closed Wednesdays here
    expect(hourSlot(data, bay(), new Date('2026-11-23T20:00:00Z')).open).toBe(false); // 07:00, before 07:30
    expect(hourSlot(data, bay(), new Date('2026-11-24T11:00:00Z')).open).toBe(false); // 22:00
    expect(hourSlot(data, bay(), new Date('2026-11-23T21:30:00Z')).onTheHour).toBe(false);
  });

  it('rounds discounts to the cent', () => {
    expect(percentOff(1800, 10)).toBe(180);
    expect(percentOff(1005, 10)).toBe(101);
  });
});

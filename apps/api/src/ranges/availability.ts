import type { Deps } from '../deps.js';
import type { RangeData } from './repo.js';

export interface AvailabilityCounts {
  bayBusy: (bayId: string, startsAt: Date) => boolean;
  robotsFree: number[];
}

/**
 * Which bay-hours are taken and how many robots are free in each hour.
 * Bookings and robots arrive in later tickets; until then everything is free.
 */
export async function availabilityCounts(_deps: Deps, _data: RangeData, starts: Date[]): Promise<AvailabilityCounts> {
  return { bayBusy: () => false, robotsFree: starts.map(() => 0) };
}

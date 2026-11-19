// What each bay is doing at a moment, for the live view.
import { dateOf, hourOf } from './time';
import type { Bay, Booking, LocalDateTime } from './types';

export type BayState = 'in-use' | 'waiting' | 'booked-later' | 'free' | 'out-of-service';

export interface BayNow {
  bay: Bay;
  state: BayState;
  /** The booking covering now, if any. */
  current: Booking | null;
  /** The next booking later today, if any. */
  next: Booking | null;
}

/**
 * In use: a checked-in booking covers now. Waiting: a booking covers now but nobody has checked in.
 * Booked later: free now, with a booking later today. Cancelled bookings don't count.
 */
export function bayStates(bays: readonly Bay[], bookings: readonly Booking[], at: LocalDateTime): BayNow[] {
  const date = dateOf(at);
  const hour = hourOf(at);
  const live = bookings.filter((b) => b.date === date && b.status !== 'cancelled');
  return bays.map((bay) => {
    const mine = live.filter((b) => b.bayId === bay.id).sort((a, b) => a.start - b.start);
    const current = mine.find((b) => b.start <= hour && hour < b.start + b.hours) ?? null;
    const next = mine.find((b) => b.start > hour) ?? null;
    let state: BayState;
    if (!bay.inService) state = 'out-of-service';
    else if (current) state = current.status === 'checked-in' ? 'in-use' : 'waiting';
    else state = next ? 'booked-later' : 'free';
    return { bay, state, current, next };
  });
}

import { describe, expect, it } from 'vitest';
import { advanceRobot, assignHires } from './fleet';
import { bayStates } from './live';
import type { Bay, Booking, Robot } from './types';

const bay = (n: number, inService = true): Bay => ({ id: `bay-${n}`, number: n, name: `Bay ${n}`, band: 'standard', inService });
const booking = (id: string, bayN: number, start: number, hours: number, status: Booking['status'], robotHire = false): Booking => ({
  id,
  date: '2026-11-19',
  bayId: `bay-${bayN}`,
  start,
  hours,
  player: id,
  source: 'app',
  status,
  robotHire,
  amount: 0,
  paidAt: '2026-11-18T10:00',
});

describe('bayStates', () => {
  const bays = [bay(1), bay(2), bay(3), bay(4), bay(5, false)];
  const bookings = [
    booking('a', 1, 14, 2, 'checked-in'),
    booking('b', 2, 15, 1, 'booked'),
    booking('c', 3, 17, 1, 'booked'),
    booking('d', 4, 15, 1, 'cancelled'),
    booking('e', 1, 18, 1, 'booked'),
  ];

  it('says what each bay is doing at 15:30', () => {
    const states = bayStates(bays, bookings, '2026-11-19T15:30');
    expect(states.map((s) => [s.bay.number, s.state, s.current?.id ?? null, s.next?.id ?? null])).toEqual([
      [1, 'in-use', 'a', 'e'],
      [2, 'waiting', 'b', null],
      [3, 'booked-later', null, 'c'],
      [4, 'free', null, null],
      [5, 'out-of-service', null, null],
    ]);
  });

  it('frees a bay when its booking ends on the hour', () => {
    expect(bayStates(bays, bookings, '2026-11-19T16:00')[0]).toMatchObject({ state: 'booked-later', current: null });
  });

  it('only looks at the day asked about', () => {
    expect(bayStates(bays, bookings, '2026-11-20T15:30')[0].state).toBe('free');
  });
});

describe('fleet', () => {
  const robot: Robot = {
    id: 'r1',
    name: 'Mulligan-7C2A',
    state: 'idle',
    battery: 80,
    ballsOnBoard: 2,
    hire: { bookingId: 'a', bayId: 'bay-1', until: '2026-11-19T16:00' },
    lastSeen: '2026-11-19T15:00',
  };

  it('drains a hired robot as time passes', () => {
    const later = advanceRobot(robot, '2026-11-19T15:40');
    expect(later.battery).toBe(60);
    expect(later.hire).not.toBeNull();
    expect(['idle', 'driving']).toContain(later.state);
  });

  it('warns when a hired robot runs low', () => {
    expect(advanceRobot({ ...robot, battery: 30 }, '2026-11-19T15:30').state).toBe('low-battery');
  });

  it('docks and charges when the hire ends', () => {
    const later = advanceRobot(robot, '2026-11-19T16:20');
    expect(later).toMatchObject({ hire: null, battery: 70, state: 'charging', ballsOnBoard: 0, lastSeen: '2026-11-19T16:20' });
    expect(advanceRobot(later, '2026-11-19T17:30')).toMatchObject({ battery: 100, state: 'docked' });
  });

  it('sends the best-charged free robot to a checked-in booking that hired one', () => {
    const free: Robot[] = [
      { ...robot, id: 'r2', hire: null, battery: 35, state: 'charging' },
      { ...robot, id: 'r3', hire: null, battery: 90, state: 'charging' },
      { ...robot, id: 'r4', hire: null, battery: 70, state: 'charging' },
    ];
    const bookings = [booking('x', 6, 15, 2, 'checked-in', true), booking('y', 7, 15, 1, 'booked', true)];
    const assigned = assignHires(free, bookings, '2026-11-19T15:10', 15 + 10 / 60);
    expect(assigned.map((r) => r.hire?.bookingId ?? null)).toEqual([null, 'x', null]);
    expect(assigned[1].hire).toEqual({ bookingId: 'x', bayId: 'bay-6', until: '2026-11-19T17:00' });
    expect(free[1].hire).toBeNull();
  });
});

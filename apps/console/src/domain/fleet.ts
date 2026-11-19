// How the fake fleet behaves over time, so the live view moves. The real fleet reports telemetry
// from the robots instead; only the shapes are shared.
import { minutesBetween } from './time';
import type { Booking, LocalDateTime, Robot } from './types';

export const DRAIN_PER_MINUTE = 0.5;
export const CHARGE_PER_MINUTE = 1;
export const LOW_BATTERY = 25;
/** A robot needs at least this much charge to go out on a hire. */
export const MIN_HIRE_BATTERY = 40;

/** Move one robot on from when it was last seen to `to`. */
export function advanceRobot(robot: Robot, to: LocalDateTime): Robot {
  const minutes = Math.max(0, minutesBetween(robot.lastSeen, to));
  if (robot.hire && robot.hire.until <= to) {
    // The hire ended: it drives home and docks. Time out after the hire is spent charging.
    const out = Math.max(0, minutesBetween(robot.lastSeen, robot.hire.until));
    const drained = Math.max(0, robot.battery - out * DRAIN_PER_MINUTE);
    return charge({ ...robot, battery: drained, hire: null, ballsOnBoard: 0, lastSeen: robot.hire.until }, to);
  }
  if (robot.hire) {
    const battery = Math.max(0, robot.battery - minutes * DRAIN_PER_MINUTE);
    const moving = Number(to.slice(-2)) % 3 !== 0;
    const state = battery < 20 ? 'low-battery' : moving ? 'driving' : 'idle';
    return { ...robot, battery, state, lastSeen: to };
  }
  return charge(robot, to);
}

function charge(robot: Robot, to: LocalDateTime): Robot {
  const minutes = Math.max(0, minutesBetween(robot.lastSeen, to));
  const battery = Math.min(100, robot.battery + minutes * CHARGE_PER_MINUTE);
  return { ...robot, battery, state: battery >= 100 ? 'docked' : 'charging', lastSeen: to };
}

/** Send free, charged robots to checked-in bookings that hired one and don't have it yet. */
export function assignHires(robots: readonly Robot[], bookings: readonly Booking[], at: LocalDateTime, hourNow: number): Robot[] {
  const next = robots.map((r) => ({ ...r }));
  const served = new Set(next.flatMap((r) => (r.hire ? [r.hire.bookingId] : [])));
  const wanting = bookings.filter(
    (b) => b.robotHire && b.status === 'checked-in' && b.date === at.slice(0, 10) && b.start <= hourNow && hourNow < b.start + b.hours && !served.has(b.id),
  );
  for (const booking of wanting) {
    const robot = next.filter((r) => !r.hire && r.battery >= MIN_HIRE_BATTERY).sort((a, b) => b.battery - a.battery)[0];
    if (!robot) break;
    const end = booking.start + booking.hours;
    robot.hire = { bookingId: booking.id, bayId: booking.bayId, until: `${booking.date}T${String(end).padStart(2, '0')}:00` };
    robot.state = 'idle';
    robot.ballsOnBoard = 0;
  }
  return next;
}

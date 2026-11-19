import { z } from '@hono/zod-openapi';
import type { Queryable } from '../db/db.js';
import type { Deps } from '../deps.js';
import { conflict } from '../errors.js';
import { Instant } from '../ranges/schemas.js';
import { encodeHireKey } from './hireKey.js';

export interface RobotRow {
  id: string;
  range_id: string;
  serial: string;
  name: string;
  home_bay_id: string | null;
  in_service: boolean;
  last_state: string | null;
  battery_pct: number | null;
  balls_on_board: number | null;
  firmware: string | null;
  last_seen_at: Date | null;
  created_at: Date;
}

export interface HireRow {
  id: string;
  robot_id: string;
  booking_id: string;
  range_id: string;
  bay_number: number;
  starts_at: Date;
  ends_at: Date;
  status: 'pending' | 'active' | 'cancelled';
  key: Uint8Array | null;
  created_at: Date;
}

interface BookingRef {
  id: string;
  range_id: string;
  bay_id: string;
  starts_at: Date;
  ends_at: Date;
}

/**
 * Inside the booking's transaction: picks a free, in-service robot at the range
 * (one docked at the booked bay first) and holds it with a pending hire.
 * Throws 409, rolling the booking back, if none is free for the whole time.
 */
export async function reserveRobot(deps: Deps, booking: BookingRef, tx: Queryable): Promise<HireRow> {
  const { db } = deps;
  const robot = await db.maybeOne<RobotRow>(
    `select r.* from robots r
     where r.range_id = $1 and r.in_service
       and not exists (
         select 1 from hires h
         where h.robot_id = r.id and h.status <> 'cancelled'
           and tstzrange(h.starts_at, h.ends_at) && tstzrange($2, $3))
     order by (r.home_bay_id is not distinct from $4) desc, r.serial
     limit 1`,
    [booking.range_id, booking.starts_at, booking.ends_at, booking.bay_id],
    tx,
  );
  if (!robot) throw conflict('No robot is free for all of that time.', 'no_robot_free');
  const bay = await db.one<{ number: number }>('select number from bays where id = $1', [booking.bay_id], tx);
  return db.one<HireRow>(
    `insert into hires (robot_id, booking_id, range_id, bay_number, starts_at, ends_at, status, created_at)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7) returning *`,
    [robot.id, booking.id, booking.range_id, bay.number, booking.starts_at, booking.ends_at, deps.now()],
    tx,
  );
}

/** Once the booking is confirmed: signs the hire key and makes the hire active. */
export async function activateHire(deps: Deps, bookingId: string): Promise<HireRow | undefined> {
  const hire = await deps.db.maybeOne<HireRow & { serial: string }>(
    "select h.*, r.serial from hires h join robots r on r.id = h.robot_id where h.booking_id = $1 and h.status = 'pending'",
    [bookingId],
  );
  if (!hire) return undefined;
  const key = encodeHireKey(
    {
      serial: hire.serial,
      start: Math.floor(hire.starts_at.getTime() / 1000),
      end: Math.floor(hire.ends_at.getTime() / 1000),
      bay: hire.bay_number,
    },
    deps.signer,
  );
  return deps.db.one<HireRow>("update hires set status = 'active', key = $2 where id = $1 returning *", [hire.id, key]);
}

/** Frees the robot. A key already on a phone stays valid until its end: robots check keys offline. */
export async function cancelHire(deps: Deps, bookingId: string): Promise<void> {
  await deps.db.many("update hires set status = 'cancelled' where booking_id = $1 and status <> 'cancelled'", [bookingId]);
}

export const HireSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['pending', 'active', 'cancelled']),
    robot: z.object({
      id: z.string().uuid(),
      serial: z.string().openapi({ example: 'A1B2' }),
      name: z.string(),
      bluetoothName: z.string().openapi({ description: 'What the robot advertises over Bluetooth', example: 'Mulligan-A1B2' }),
    }),
    bayNumber: z.number().int(),
    startsAt: Instant,
    endsAt: Instant,
    key: z
      .object({
        hex: z.string().openapi({ description: 'The 78-byte hire key, hex' }),
        base64url: z.string().openapi({ description: 'The same bytes, base64url without padding' }),
      })
      .nullable()
      .openapi({ description: 'Write these 78 bytes to the robot\'s Unlock characteristic. Null until paid, and once cancelled.' }),
    link: z
      .string()
      .url()
      .nullable()
      .openapi({ description: 'Opens the Drive tab with the key: APP_URL/drive?hire=<base64url>', example: 'http://localhost:5173/app/drive?hire=AUExQjKA7DZrkPo2awM…' }),
  })
  .openapi('Hire');

export type HireOut = z.infer<typeof HireSchema>;

export const hireLink = (deps: Deps, key: Uint8Array) => `${deps.config.appUrl}/drive?hire=${Buffer.from(key).toString('base64url')}`;

export function hireOut(deps: Deps, h: HireRow, robot: Pick<RobotRow, 'id' | 'serial' | 'name'>): HireOut {
  const key = h.status === 'active' && h.key ? Buffer.from(h.key) : null;
  return {
    id: h.id,
    status: h.status,
    robot: { id: robot.id, serial: robot.serial, name: robot.name, bluetoothName: `Mulligan-${robot.serial}` },
    bayNumber: h.bay_number,
    startsAt: h.starts_at.toISOString(),
    endsAt: h.ends_at.toISOString(),
    key: key ? { hex: key.toString('hex'), base64url: key.toString('base64url') } : null,
    link: key ? hireLink(deps, key) : null,
  };
}

export async function hireForBooking(deps: Deps, bookingId: string, q?: Queryable): Promise<HireOut | null> {
  const row = await deps.db.maybeOne<HireRow & { r_id: string; serial: string; name: string }>(
    'select h.*, r.id as r_id, r.serial, r.name from hires h join robots r on r.id = h.robot_id where h.booking_id = $1',
    [bookingId],
    q,
  );
  return row ? hireOut(deps, row, { id: row.r_id, serial: row.serial, name: row.name }) : null;
}

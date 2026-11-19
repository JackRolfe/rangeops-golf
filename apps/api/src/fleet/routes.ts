import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { isStaff, requireAccount, requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { conflict, errors, forbidden, notFound, unprocessable } from '../errors.js';
import { SERIAL } from '../hires/hireKey.js';
import type { RobotRow } from '../hires/service.js';
import { findRange, isUuid, type BayRow } from '../ranges/repo.js';
import { Instant, RangeIdParam } from '../ranges/schemas.js';
import { addDays, localDate, zonedInstant } from '../time.js';

/** The robot states from the control link's Telemetry byte 0, by name. */
export const ROBOT_STATES = ['idle', 'driving', 'at_limit', 'link_lost', 'stopped_by_switch', 'fault', 'low_battery', 'locked'] as const;

const FleetHireSchema = z
  .object({
    hireId: z.string().uuid(),
    bookingId: z.string().uuid(),
    bayNumber: z.number().int(),
    startsAt: Instant,
    endsAt: Instant,
    checkedInAt: Instant.nullable(),
  })
  .openapi('FleetHire');

const FleetRobotSchema = z
  .object({
    id: z.string().uuid(),
    rangeId: z.string().uuid(),
    serial: z.string(),
    bluetoothName: z.string(),
    name: z.string(),
    homeBay: z.object({ id: z.string().uuid(), number: z.number().int(), name: z.string() }).nullable(),
    inService: z.boolean(),
    status: z
      .object({
        state: z.enum(ROBOT_STATES).nullable(),
        batteryPct: z.number().int().nullable(),
        ballsOnBoard: z.number().int().nullable(),
        firmware: z.string().nullable(),
        lastSeenAt: Instant.nullable(),
      })
      .openapi({ description: 'The latest status reported, by staff or by the phone driving it' }),
    currentHire: FleetHireSchema.nullable(),
    nextHire: FleetHireSchema.nullable().openapi({ description: 'The next hire later today, local time' }),
  })
  .openapi('FleetRobot');

const RobotIdParam = z.object({ robotId: z.string().uuid().openapi({ param: { name: 'robotId', in: 'path' } }) });

const fleet = createRoute({
  method: 'get',
  path: '/ranges/{rangeId}/fleet',
  tags: ['Robots'],
  summary: "The range's robots: status, battery and hires (staff)",
  description: 'What the console shows. A partner portal could read the same thing later, once it has a way to authenticate.',
  security: bearer,
  request: { params: RangeIdParam },
  responses: {
    200: {
      description: 'The fleet',
      content: { 'application/json': { schema: z.object({ rangeId: z.string().uuid(), at: Instant, robots: z.array(FleetRobotSchema) }).openapi('Fleet') } },
    },
    ...errors(401, 403, 404),
  },
});

const reportStatus = createRoute({
  method: 'post',
  path: '/robots/{robotId}/status',
  tags: ['Robots'],
  summary: "Report a robot's latest telemetry",
  description: "Staff can post it, and so can the account holding the robot's current hire, so the phone driving it can relay what the robot says.",
  security: bearer,
  request: {
    params: RobotIdParam,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              state: z.enum(ROBOT_STATES),
              batteryPct: z.number().int().min(0).max(100),
              ballsOnBoard: z.number().int().min(0).max(254).nullable().optional().openapi({ description: 'Null if the robot does not count balls (telemetry 255)' }),
              firmware: z.string().max(100).optional(),
            })
            .openapi('RobotStatusReport'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Recorded', content: { 'application/json': { schema: FleetRobotSchema } } },
    ...errors(400, 401, 403, 404),
  },
});

const RobotBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  homeBayId: z.string().uuid().nullable().optional(),
  inService: z.boolean().optional(),
});

const createRobot = createRoute({
  method: 'post',
  path: '/ranges/{rangeId}/robots',
  tags: ['Robots'],
  summary: 'Add a robot to the range (staff)',
  security: bearer,
  request: {
    params: RangeIdParam,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RobotBody.extend({
            serial: z.string().regex(SERIAL).openapi({ description: '4 characters, A–Z or 0–9, as after "Mulligan-" in its Bluetooth name', example: 'E5F6' }),
          }).openapi('NewRobot'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Added', content: { 'application/json': { schema: FleetRobotSchema } } },
    ...errors(400, 401, 403, 404, 409, 422),
  },
});

const updateRobot = createRoute({
  method: 'patch',
  path: '/robots/{robotId}',
  tags: ['Robots'],
  summary: 'Rename a robot, change its home bay, or take it out of service (staff)',
  description: 'A robot out of service is never assigned to a new hire. Hires it already has stay.',
  security: bearer,
  request: {
    params: RobotIdParam,
    body: { required: true, content: { 'application/json': { schema: RobotBody.openapi('RobotUpdate') } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: FleetRobotSchema } } },
    ...errors(400, 401, 403, 404, 422),
  },
});

interface HireLite {
  id: string;
  robot_id: string;
  booking_id: string;
  bay_number: number;
  starts_at: Date;
  ends_at: Date;
  checked_in_at: Date | null;
}

export function fleetRoutes(app: Api, deps: Deps) {
  const { db } = deps;

  const fleetRobots = async (rangeId: string, onlyRobotId?: string) => {
    const range = await db.one<{ time_zone: string }>('select time_zone from ranges where id = $1', [rangeId]);
    const now = deps.now();
    const endOfDay = zonedInstant(addDays(localDate(now, range.time_zone), 1), 0, range.time_zone);
    const robots = await db.many<RobotRow>(
      `select * from robots where range_id = $1 ${onlyRobotId ? 'and id = $2' : ''} order by serial`,
      onlyRobotId ? [rangeId, onlyRobotId] : [rangeId],
    );
    const bays = await db.many<BayRow>('select * from bays where range_id = $1', [rangeId]);
    const hires = await db.many<HireLite>(
      `select h.id, h.robot_id, h.booking_id, h.bay_number, h.starts_at, h.ends_at, b.checked_in_at
       from hires h join bookings b on b.id = h.booking_id
       where h.range_id = $1 and h.status = 'active' and h.ends_at > $2 and h.starts_at < $3
       order by h.starts_at`,
      [rangeId, now, endOfDay],
    );
    const hireOut = (h: HireLite | undefined) =>
      h
        ? {
            hireId: h.id,
            bookingId: h.booking_id,
            bayNumber: h.bay_number,
            startsAt: h.starts_at.toISOString(),
            endsAt: h.ends_at.toISOString(),
            checkedInAt: h.checked_in_at?.toISOString() ?? null,
          }
        : null;
    return robots.map((r) => {
      const mine = hires.filter((h) => h.robot_id === r.id);
      const bay = bays.find((b) => b.id === r.home_bay_id);
      return {
        id: r.id,
        rangeId: r.range_id,
        serial: r.serial,
        bluetoothName: `Mulligan-${r.serial}`,
        name: r.name,
        homeBay: bay ? { id: bay.id, number: bay.number, name: bay.name } : null,
        inService: r.in_service,
        status: {
          state: r.last_state as (typeof ROBOT_STATES)[number] | null,
          batteryPct: r.battery_pct,
          ballsOnBoard: r.balls_on_board,
          firmware: r.firmware,
          lastSeenAt: r.last_seen_at?.toISOString() ?? null,
        },
        currentHire: hireOut(mine.find((h) => h.starts_at <= now)),
        nextHire: hireOut(mine.find((h) => h.starts_at > now)),
      };
    });
  };

  const findRobot = async (robotId: string) => {
    const robot = await db.maybeOne<RobotRow>('select * from robots where id = $1', [robotId]);
    if (!robot) throw notFound('No such robot.');
    return robot;
  };

  const checkHomeBay = async (rangeId: string, bayId: string | null | undefined) => {
    if (!bayId) return;
    const ok = isUuid(bayId) && (await db.maybeOne('select 1 from bays where id = $1 and range_id = $2', [bayId, rangeId]));
    if (!ok) throw unprocessable("The home bay must be one of this range's bays.", 'bad_home_bay');
  };

  app.openapi(fleet, async (c) => {
    const range = await findRange(db, c.req.valid('param').rangeId);
    await requireStaff(c, deps, range.id);
    return c.json({ rangeId: range.id, at: deps.now().toISOString(), robots: await fleetRobots(range.id) }, 200);
  });

  app.openapi(reportStatus, async (c) => {
    const account = await requireAccount(c, deps);
    const robot = await findRobot(c.req.valid('param').robotId);
    const now = deps.now();
    const hirer = await db.maybeOne(
      `select 1 from hires h join bookings b on b.id = h.booking_id
       where h.robot_id = $1 and h.status = 'active' and b.account_id = $2 and h.starts_at <= $3 and h.ends_at > $3`,
      [robot.id, account.id, now],
    );
    if (!hirer && !(await isStaff(deps, account.id, robot.range_id))) {
      throw forbidden("Only staff, or whoever is hiring this robot right now, can report its status.");
    }
    const body = c.req.valid('json');
    await db.many(
      `update robots set last_state = $2, battery_pct = $3, balls_on_board = $4, firmware = coalesce($5, firmware), last_seen_at = $6
       where id = $1`,
      [robot.id, body.state, body.batteryPct, body.ballsOnBoard ?? null, body.firmware ?? null, now],
    );
    return c.json((await fleetRobots(robot.range_id, robot.id))[0]!, 200);
  });

  app.openapi(createRobot, async (c) => {
    const range = await findRange(db, c.req.valid('param').rangeId);
    await requireStaff(c, deps, range.id);
    const body = c.req.valid('json');
    await checkHomeBay(range.id, body.homeBayId);
    const row = await db.maybeOne<RobotRow>(
      `insert into robots (range_id, serial, name, home_bay_id, in_service, created_at)
       values ($1, $2, $3, $4, $5, $6) on conflict (serial) do nothing returning *`,
      [range.id, body.serial, body.name ?? `Mulligan ${body.serial}`, body.homeBayId ?? null, body.inService ?? true, deps.now()],
    );
    if (!row) throw conflict(`A robot with serial ${body.serial} already exists.`, 'duplicate_serial');
    return c.json((await fleetRobots(range.id, row.id))[0]!, 201);
  });

  app.openapi(updateRobot, async (c) => {
    const robot = await findRobot(c.req.valid('param').robotId);
    await requireStaff(c, deps, robot.range_id);
    const body = c.req.valid('json');
    await checkHomeBay(robot.range_id, body.homeBayId);
    await db.many(
      `update robots set
         name = coalesce($2, name),
         home_bay_id = case when $3 then $4::uuid else home_bay_id end,
         in_service = coalesce($5, in_service)
       where id = $1`,
      [robot.id, body.name ?? null, body.homeBayId !== undefined, body.homeBayId ?? null, body.inService ?? null],
    );
    return c.json((await fleetRobots(robot.range_id, robot.id))[0]!, 200);
  });
}

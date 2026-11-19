import { describe, expect, it } from 'vitest'
import { issueBenchKey } from './hireKey'
import { LIMIT, RobotState, encodeHireKey, type Telemetry } from './protocol'
import { HireKeyRefused } from './RobotLink'
import { SIM_DEFAULTS, SimulatedRobot, type SimulatedRobotOptions } from './SimulatedRobot'

const NOW = 1_800_000_000
const window = { serial: 'SIM1', bay: 7, start: NOW - 300, end: NOW + 3300 }

function makeRobot(options: SimulatedRobotOptions = {}) {
  let now = NOW
  const robot = new SimulatedRobot({ autoRun: false, balls: [], nowUnix: () => now, ...options })
  const seen: Telemetry[] = []
  robot.onTelemetry((telemetry) => seen.push(telemetry))
  let seq = 0
  return {
    robot,
    seen,
    last: () => seen[seen.length - 1],
    setNow: (unix: number) => {
      now = unix
    },
    async connect() {
      return robot.connect(await issueBenchKey(window))
    },
    /** Hold the stick for `ms`, sending 20 times a second as the app does. */
    hold(x: number, y: number, ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        seq = (seq + 1) & 0xff
        robot.sendDrive({ seq, x, y, thumb: true })
        robot.advance(50)
      }
    },
    release() {
      for (let index = 0; index < 3; index++) {
        seq = (seq + 1) & 0xff
        robot.sendDrive({ seq, x: 0, y: 0, thumb: false })
        robot.advance(50)
      }
    },
  }
}

describe('SimulatedRobot hire keys', () => {
  it('unlocks with a valid key and reports its Info', async () => {
    const sim = makeRobot()
    await expect(sim.connect()).resolves.toEqual({ name: 'Mulligan-SIM1', serial: 'SIM1', firmware: '0.0.0-sim', hardware: 'SIM' })
    expect(sim.robot.connected).toBe(true)
    expect(sim.last().state).toBe(RobotState.Idle)
  })

  it.each([
    ['bad_length', async () => new Uint8Array(77)],
    ['bad_version', async () => encodeHireKey({ ...window, version: 2 }, (await issueBenchKey(window)).slice(14))],
    ['bad_signature', async () => encodeHireKey({ ...window, version: 1 }, new Uint8Array(64))],
    ['wrong_serial', async () => issueBenchKey({ ...window, serial: 'A1B2' })],
    ['not_yet', async () => issueBenchKey({ ...window, start: NOW + 60 })],
    ['expired', async () => issueBenchKey({ ...window, end: NOW })],
  ])('refuses a %s key and stays locked', async (reason, makeKey) => {
    const sim = makeRobot()
    const refusal = await sim.robot.connect(await makeKey()).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(HireKeyRefused)
    expect((refusal as HireKeyRefused).reason).toBe(reason)
    expect(sim.robot.connected).toBe(false)
    expect(sim.robot.firmware.locked).toBe(true)
    sim.robot.firmware.writeDrive(new Uint8Array([1, 0, 100, 1]))
    sim.robot.advance(500)
    expect(sim.robot.world().robot.y).toBe(0.5)
  })

  it('locks again when the hire ends and on disconnect', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.setNow(window.end)
    sim.robot.advance(200)
    expect(sim.last().state).toBe(RobotState.Locked)

    const again = makeRobot()
    await again.connect()
    await again.robot.disconnect()
    expect(again.robot.firmware.locked).toBe(true)
  })
})

describe('SimulatedRobot driving', () => {
  it('drives forward while the stick is held, at the speed cap', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.hold(0, 100, 3000)
    const { robot } = sim.robot.world()
    expect(robot.y).toBeGreaterThan(0.5 + 2.5)
    expect(sim.last().state).toBe(RobotState.Driving)
    expect(sim.last().limits & LIMIT.speed).toBe(LIMIT.speed)
    expect(sim.last().lastSeq).toBeGreaterThan(50) // 60 messages sent; telemetry lags by under 200 ms
    expect(sim.last().distanceDm).toBeGreaterThan(25)
  })

  it('does not set the speed flag below the cap', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.hold(0, 50, 2000)
    expect(sim.last().limits & LIMIT.speed).toBe(0)
  })

  it('stops when the stick is released', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.hold(0, 100, 2000)
    sim.release()
    sim.robot.advance(1000)
    const stopped = sim.robot.world().robot.y
    sim.robot.advance(1000)
    expect(sim.robot.world().robot.y).toBe(stopped)
    expect(sim.last().state).toBe(RobotState.Idle)
  })

  it('stops and reports link lost 300 ms after the last Drive message', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.hold(0, 100, 1000)
    sim.robot.advance(250)
    expect(sim.robot.firmware.telemetryBytes()[0]).toBe(RobotState.Driving)
    sim.robot.advance(100)
    expect(sim.robot.firmware.telemetryBytes()[0]).toBe(RobotState.LinkLost)
    sim.robot.advance(1000)
    const stopped = sim.robot.world().robot.y
    sim.robot.advance(500)
    expect(sim.robot.world().robot.y).toBe(stopped)
    sim.hold(0, 100, 300)
    expect(sim.last().state).toBe(RobotState.Driving)
  })

  it('ignores a late or repeated Drive message', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.robot.sendDrive({ seq: 10, x: 0, y: 100, thumb: true })
    sim.robot.sendDrive({ seq: 9, x: 0, y: 0, thumb: false })
    sim.robot.sendDrive({ seq: 10, x: 0, y: 0, thumb: false })
    sim.robot.advance(200)
    expect(sim.last().lastSeq).toBe(10)
    expect(sim.last().state).toBe(RobotState.Driving)
  })

  it('turns in robot terms: sideways on the stick turns, it does not slide', async () => {
    const sim = makeRobot()
    await sim.connect()
    sim.hold(100, 0, 500)
    const { robot } = sim.robot.world()
    expect(robot.heading).toBeLessThan(Math.PI / 2 - 1)
    expect(robot.x).toBe(0)
  })

  it('goes where the stick points in range terms, as the site demo does', async () => {
    const sim = makeRobot({ steering: 'range' })
    await sim.connect()
    sim.hold(100, 0, 1500)
    const { robot } = sim.robot.world()
    expect(robot.x).toBeGreaterThan(1)
    expect(robot.y).toBeCloseTo(0.5)
  })
})

describe('SimulatedRobot lane limit', () => {
  it('stops at the far end and says so', async () => {
    const sim = makeRobot({ start: { x: 0, y: 29 } })
    await sim.connect()
    sim.hold(0, 100, 3000)
    expect(sim.robot.world().robot.y).toBe(SIM_DEFAULTS.lane.far)
    expect(sim.last().state).toBe(RobotState.AtLimit)
    expect(sim.last().limits & LIMIT.farEnd).toBe(LIMIT.farEnd)
    sim.release()
    sim.robot.advance(400)
    expect(sim.last().limits).toBe(0)
  })

  it('holds the left and right edges with their own flags', async () => {
    const edge = SIM_DEFAULTS.lane.halfWidth - SIM_DEFAULTS.bodyRadius
    const left = makeRobot({ start: { x: -edge + 0.5, y: 5, heading: Math.PI } })
    await left.connect()
    left.hold(0, 100, 2000)
    expect(left.robot.world().robot.x).toBeCloseTo(-edge)
    expect(left.last().limits & LIMIT.leftEdge).toBe(LIMIT.leftEdge)
    expect(left.last().state).toBe(RobotState.AtLimit)

    const right = makeRobot({ start: { x: edge - 0.5, y: 5, heading: 0 } })
    await right.connect()
    right.hold(0, 100, 2000)
    expect(right.robot.world().robot.x).toBeCloseTo(edge)
    expect(right.last().limits & LIMIT.rightEdge).toBe(LIMIT.rightEdge)
  })
})

describe('SimulatedRobot pickup', () => {
  it('scoops balls at its mouth, ten at most, and empties at the bay', async () => {
    const balls = Array.from({ length: 12 }, (_, index) => ({ x: 0, y: 2 + index * 0.5 }))
    const sim = makeRobot({ balls })
    await sim.connect()
    sim.hold(0, 100, 9000)
    expect(sim.last().ballsOnBoard).toBe(10)
    expect(sim.robot.world().balls).toHaveLength(2)

    sim.hold(0, -100, 12000) // back to the bay
    sim.release()
    sim.robot.advance(1600)
    expect(sim.robot.world().onBoard).toBe(0)
    expect(sim.robot.world().broughtBack).toBe(10)
    expect(sim.last().ballsOnBoard).toBe(0)
  })
})

describe('SimulatedRobot telemetry', () => {
  it('notifies five times a second while connected, and not after disconnecting', async () => {
    const sim = makeRobot()
    await sim.connect()
    const before = sim.seen.length
    sim.robot.advance(1000)
    expect(sim.seen.length - before).toBe(5)
    await sim.robot.disconnect()
    sim.robot.advance(1000)
    expect(sim.seen.length - before).toBe(5)
  })

  it('reports the stop switch, faults and a low battery', async () => {
    const sim = makeRobot({ batteryPercent: 5 })
    await sim.connect()
    sim.robot.advance(200)
    expect(sim.last().state).toBe(RobotState.LowBattery)
    sim.robot.firmware.setFaults(1)
    sim.robot.advance(200)
    expect(sim.last()).toMatchObject({ state: RobotState.Fault, faults: 1 })
    sim.robot.firmware.setStopSwitch(true)
    sim.robot.advance(200)
    expect(sim.last().state).toBe(RobotState.StoppedBySwitch)
  })
})

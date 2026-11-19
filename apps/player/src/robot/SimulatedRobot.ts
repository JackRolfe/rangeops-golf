import { benchVerifier, checkHireKey, type HireKeyCheck, type HireKeyVerifier } from './hireKey'
import {
  LIMIT,
  RobotState,
  decodeDrive,
  decodeHireKey,
  decodeTelemetry,
  encodeDrive,
  encodeTelemetry,
  formatInfo,
  isNewerSequence,
  parseInfo,
  type DriveMessage,
  type RobotInfo,
  type Telemetry,
} from './protocol'
import { HireKeyRefused, type RobotLink } from './RobotLink'

/**
 * A pretend Mulligan behind RobotLink, so the Drive tab can be built before
 * the robot exists. The firmware half (`SimulatedFirmware`) only sees bytes, as
 * a real robot would: Drive and Unlock writes in, Telemetry notifications out.
 * The lane, pickup and lane limit are ported from the site demo
 * (apps/site/index.html, "drive"), in metres instead of pixels.
 *
 * World: metres, origin at the front of the bay mat on the bay's centre line,
 * x to the right, y up the range. Heading is in radians from +x, so up the
 * range is pi/2.
 */

/** What the stick means. R0 starts in robot terms; the site demo uses range terms. */
export type Steering = 'robot' | 'range'

export interface Lane {
  /** Metres either side of the bay's centre line. */
  halfWidth: number
  /** Metres from the bay to the far limit. */
  far: number
}

export interface Point {
  x: number
  y: number
}

export interface SimulatedWorld {
  lane: Lane
  robot: Point & { heading: number }
  balls: Point[]
  onBoard: number
  /** Balls unloaded at the bay so far. */
  broughtBack: number
  capacity: number
}

export interface SimulatedRobotOptions {
  serial?: string
  firmware?: string
  verifier?: HireKeyVerifier
  /** The robot's clock, in Unix seconds. */
  nowUnix?: () => number
  steering?: Steering
  lane?: Lane
  batteryPercent?: number
  /** Where the balls are; random short shots if left out. */
  balls?: Point[]
  start?: Point & { heading?: number }
  random?: () => number
  /** Run on a timer (the app). False for tests, which call `advance`. */
  autoRun?: boolean
}

export const SIM_DEFAULTS = {
  serial: 'SIM1',
  lane: { halfWidth: 4.5, far: 30 } as Lane,
  /** m/s that full stick asks for. */
  motorMax: 1.5,
  /** m/s, 4 km/h: walking pace, capped in firmware. */
  speedCap: 1.1,
  accel: 2,
  brake: 6,
  /** rad/s at full sideways stick, robot terms. */
  turnRate: 2.5,
  /** rad/s the robot swings toward the stick, range terms (the demo's 7). */
  rangeTurnRate: 7,
  bodyRadius: 0.25,
  mouthOffset: 0.3,
  pickupRadius: 0.22,
  capacity: 10,
  /** Metres from the bay that count as home for unloading. */
  homeZone: 1.5,
  unloadAfterMs: 1000,
  watchdogMs: 300,
  telemetryMs: 200,
  stepMs: 10,
  /** Percent per second while driving: a full pack lasts three hours. */
  drainDriving: 100 / (3 * 3600),
  drainIdle: 100 / (3 * 3600) / 5,
  lowBattery: 10,
  ballCount: 8,
} as const

/** Random short shots, 3 to 20 m out, at least a metre apart. */
export function spawnBalls(lane: Lane, random: () => number, count: number = SIM_DEFAULTS.ballCount): Point[] {
  const balls: Point[] = []
  const reach = Math.min(20, lane.far - 1)
  for (let tries = 0; balls.length < count && tries < 400; tries++) {
    const x = (random() * 2 - 1) * (lane.halfWidth - 0.5)
    const y = 3 + Math.pow(random(), 1.4) * (reach - 3)
    if (balls.every((ball) => Math.hypot(ball.x - x, ball.y - y) > 1)) balls.push({ x, y })
  }
  return balls
}

function turnToward(angle: number, target: number, max: number): number {
  const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle))
  return Math.abs(difference) <= max ? target : angle + Math.sign(difference) * max
}

function approach(value: number, target: number, rate: number): number {
  return value < target ? Math.min(target, value + rate) : Math.max(target, value - rate)
}

/** The robot's side of the link. Bytes in, bytes out. */
export class SimulatedFirmware {
  readonly serial: string
  readonly firmware: string
  private readonly verifier: HireKeyVerifier
  private readonly nowUnix: () => number
  private readonly steering: Steering
  private readonly lane: Lane
  private readonly random: () => number

  private unlockedUntil: number | null = null
  private lastSeq: number | null = null
  private command: DriveMessage = { seq: 0, x: 0, y: 0, thumb: false }
  private sinceDriveMs = 0
  private linkLost = false
  private stopSwitch = false
  private faults = 0
  private limits = 0

  private x: number
  private y: number
  private heading: number
  private speed = 0
  private moveDirection: number
  private battery: number
  private balls: Point[]
  private onBoard = 0
  private broughtBack = 0
  private homeStillMs = 0
  private respawnInMs: number | null = null

  constructor(options: SimulatedRobotOptions = {}) {
    this.serial = options.serial ?? SIM_DEFAULTS.serial
    this.firmware = options.firmware ?? '0.0.0-sim'
    this.verifier = options.verifier ?? benchVerifier
    this.nowUnix = options.nowUnix ?? (() => Math.floor(Date.now() / 1000))
    this.steering = options.steering ?? 'robot'
    this.lane = options.lane ?? SIM_DEFAULTS.lane
    this.random = options.random ?? Math.random
    this.x = options.start?.x ?? 0
    this.y = options.start?.y ?? 0.5
    this.heading = options.start?.heading ?? Math.PI / 2
    this.moveDirection = this.heading
    this.battery = options.batteryPercent ?? 82
    this.balls = options.balls?.map((ball) => ({ ...ball })) ?? spawnBalls(this.lane, this.random)
  }

  get locked(): boolean {
    return this.unlockedUntil === null
  }

  readInfo(): string {
    return formatInfo({ serial: this.serial, firmware: this.firmware, hardware: 'SIM' })
  }

  /** An Unlock write. Locks on any failure. */
  async writeUnlock(bytes: Uint8Array): Promise<HireKeyCheck> {
    const result = await checkHireKey(bytes, { serial: this.serial, nowUnix: this.nowUnix(), verifier: this.verifier })
    if (result === 'ok') {
      this.unlockedUntil = decodeHireKey(bytes)!.end
      this.lastSeq = null
      this.sinceDriveMs = 0
    } else {
      this.lock()
    }
    return result
  }

  /** The phone went away: lock, brake, forget the sequence. */
  lock(): void {
    this.unlockedUntil = null
    this.lastSeq = null
    this.command = { seq: 0, x: 0, y: 0, thumb: false }
    this.linkLost = false
  }

  /** A Drive write. Ignored while locked, if malformed, or if not newer than the last. */
  writeDrive(bytes: Uint8Array): void {
    if (this.locked) return
    const message = decodeDrive(bytes)
    if (!message) return
    if (this.lastSeq !== null && !isNewerSequence(message.seq, this.lastSeq)) return
    this.lastSeq = message.seq
    this.command = message
    this.sinceDriveMs = 0
    this.linkLost = false
  }

  setStopSwitch(pressed: boolean): void {
    this.stopSwitch = pressed
  }

  setFaults(bits: number): void {
    this.faults = bits
  }

  telemetryBytes(): Uint8Array {
    return encodeTelemetry(this.telemetry())
  }

  private telemetry(): Telemetry {
    return {
      state: this.state(),
      batteryPercent: this.battery,
      ballsOnBoard: this.onBoard,
      faults: this.faults,
      distanceDm: Math.hypot(this.x, this.y) * 10,
      limits: this.limits,
      lastSeq: this.lastSeq ?? 0,
    }
  }

  private state(): RobotState {
    if (this.locked) return RobotState.Locked
    if (this.stopSwitch) return RobotState.StoppedBySwitch
    if (this.faults) return RobotState.Fault
    if (this.linkLost) return RobotState.LinkLost
    if (this.limits & ~LIMIT.speed) return RobotState.AtLimit
    if (this.battery < SIM_DEFAULTS.lowBattery) return RobotState.LowBattery
    return Math.abs(this.speed) > 0.01 ? RobotState.Driving : RobotState.Idle
  }

  world(): SimulatedWorld {
    return {
      lane: { ...this.lane },
      robot: { x: this.x, y: this.y, heading: this.heading },
      balls: this.balls.map((ball) => ({ ...ball })),
      onBoard: this.onBoard,
      broughtBack: this.broughtBack,
      capacity: SIM_DEFAULTS.capacity,
    }
  }

  /** Advance the world by `ms`, in the firmware's order: stop switch, signal timeout, faults, lane limit, speed cap. */
  step(ms: number): void {
    const dt = ms / 1000
    if (this.unlockedUntil !== null && this.nowUnix() >= this.unlockedUntil) this.lock()

    this.sinceDriveMs += ms
    if (!this.locked && this.command.thumb && this.sinceDriveMs > SIM_DEFAULTS.watchdogMs) {
      this.linkLost = true
      this.command = { ...this.command, x: 0, y: 0, thumb: false }
    }

    const stick = this.command
    const wantsToMove =
      !this.locked && !this.stopSwitch && !this.faults && !this.linkLost && stick.thumb && (stick.x !== 0 || stick.y !== 0)
    let limits = 0
    let cap: number = SIM_DEFAULTS.speedCap
    if (this.battery < SIM_DEFAULTS.lowBattery) cap /= 2

    let targetSpeed = 0
    if (wantsToMove) {
      if (this.steering === 'robot') {
        targetSpeed = (stick.y / 100) * SIM_DEFAULTS.motorMax
        this.heading -= (stick.x / 100) * SIM_DEFAULTS.turnRate * dt
        this.moveDirection = this.heading
      } else {
        const magnitude = Math.min(1, Math.hypot(stick.x, stick.y) / 100)
        const direction = Math.atan2(stick.y, stick.x)
        this.heading = turnToward(this.heading, direction, SIM_DEFAULTS.rangeTurnRate * dt)
        this.moveDirection = direction
        targetSpeed = magnitude * SIM_DEFAULTS.motorMax
      }
      if (Math.abs(targetSpeed) > cap) {
        targetSpeed = Math.sign(targetSpeed) * cap
        limits |= LIMIT.speed
      }
    }
    const braking = Math.abs(targetSpeed) < Math.abs(this.speed) || Math.sign(targetSpeed) !== Math.sign(this.speed)
    this.speed = approach(this.speed, targetSpeed, (braking ? SIM_DEFAULTS.brake : SIM_DEFAULTS.accel) * dt)

    const nextX = this.x + Math.cos(this.moveDirection) * this.speed * dt
    const nextY = this.y + Math.sin(this.moveDirection) * this.speed * dt
    const edge = this.lane.halfWidth - SIM_DEFAULTS.bodyRadius
    if (nextX < -edge) limits |= LIMIT.leftEdge
    if (nextX > edge) limits |= LIMIT.rightEdge
    if (nextY > this.lane.far) limits |= LIMIT.farEnd
    this.x = Math.max(-edge, Math.min(edge, nextX))
    // The bay is behind the robot; it stops there without calling it a limit.
    this.y = Math.max(0, Math.min(this.lane.far, nextY))
    this.limits = this.locked ? 0 : limits

    this.pickUp()
    this.unloadAtBay(ms)
    this.drain(dt)
  }

  private pickUp(): void {
    const mouthX = this.x + Math.cos(this.heading) * SIM_DEFAULTS.mouthOffset
    const mouthY = this.y + Math.sin(this.heading) * SIM_DEFAULTS.mouthOffset
    this.balls = this.balls.filter((ball) => {
      if (this.onBoard >= SIM_DEFAULTS.capacity) return true
      if (Math.hypot(ball.x - mouthX, ball.y - mouthY) > SIM_DEFAULTS.pickupRadius) return true
      this.onBoard++
      return false
    })
  }

  /** Unloading is by hand at the mat: once the robot sits still at the bay for a second, it's empty. */
  private unloadAtBay(ms: number): void {
    const home = Math.abs(this.x) < SIM_DEFAULTS.homeZone && this.y < SIM_DEFAULTS.homeZone
    if (home && this.onBoard > 0 && Math.abs(this.speed) < 0.01) {
      this.homeStillMs += ms
      if (this.homeStillMs >= SIM_DEFAULTS.unloadAfterMs) {
        this.broughtBack += this.onBoard
        this.onBoard = 0
        this.homeStillMs = 0
      }
    } else {
      this.homeStillMs = 0
    }
    if (this.balls.length === 0 && this.onBoard === 0) {
      this.respawnInMs ??= 1600
      this.respawnInMs -= ms
      if (this.respawnInMs <= 0) {
        this.balls = spawnBalls(this.lane, this.random)
        this.respawnInMs = null
      }
    }
  }

  private drain(dt: number): void {
    const rate = Math.abs(this.speed) > 0.01 ? SIM_DEFAULTS.drainDriving : SIM_DEFAULTS.drainIdle
    this.battery = Math.max(0, this.battery - rate * dt)
  }
}

/** RobotLink over a SimulatedFirmware: the app's half, encoding and decoding through the codec. */
export class SimulatedRobot implements RobotLink {
  readonly firmware: SimulatedFirmware
  private readonly autoRun: boolean
  private listeners = new Set<(telemetry: Telemetry) => void>()
  private isConnected = false
  private sinceTelemetryMs = 0
  private pendingMs = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick = 0

  constructor(options: SimulatedRobotOptions = {}) {
    this.firmware = new SimulatedFirmware(options)
    this.autoRun = options.autoRun ?? true
  }

  get connected(): boolean {
    return this.isConnected
  }

  async connect(hireKey: Uint8Array): Promise<RobotInfo> {
    this.isConnected = true
    const info = parseInfo(this.firmware.readInfo())
    const result = await this.firmware.writeUnlock(hireKey)
    if (result !== 'ok') {
      this.isConnected = false
      this.firmware.lock()
      throw new HireKeyRefused(result)
    }
    this.sinceTelemetryMs = 0
    this.notify()
    if (this.autoRun) this.startTimer()
    return info!
  }

  sendDrive(message: DriveMessage): void {
    if (!this.isConnected) return
    this.firmware.writeDrive(encodeDrive(message))
  }

  onTelemetry(listener: (telemetry: Telemetry) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async disconnect(): Promise<void> {
    this.stopTimer()
    this.isConnected = false
    this.firmware.lock()
  }

  /** Advance simulated time. Telemetry goes out every 200 ms while connected. */
  advance(ms: number): void {
    this.pendingMs += ms
    while (this.pendingMs >= SIM_DEFAULTS.stepMs) {
      this.pendingMs -= SIM_DEFAULTS.stepMs
      this.firmware.step(SIM_DEFAULTS.stepMs)
      if (!this.isConnected) continue
      this.sinceTelemetryMs += SIM_DEFAULTS.stepMs
      if (this.sinceTelemetryMs >= SIM_DEFAULTS.telemetryMs) {
        this.sinceTelemetryMs -= SIM_DEFAULTS.telemetryMs
        this.notify()
      }
    }
  }

  world(): SimulatedWorld {
    return this.firmware.world()
  }

  private notify(): void {
    const telemetry = decodeTelemetry(this.firmware.telemetryBytes())
    if (!telemetry) return
    for (const listener of this.listeners) listener(telemetry)
  }

  private startTimer(): void {
    this.stopTimer()
    this.lastTick = performance.now()
    this.timer = setInterval(() => {
      const now = performance.now()
      // Cap a long gap (a backgrounded tab) so the robot doesn't jump.
      this.advance(Math.min(100, now - this.lastTick))
      this.lastTick = now
    }, 20)
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}

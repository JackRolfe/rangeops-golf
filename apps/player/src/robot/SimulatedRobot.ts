import { benchVerifier, checkHireKey, type HireKeyVerifier } from './hireKey'
import {
  FAULT,
  LIMIT,
  RobotState,
  decodeDrive,
  decodeHireKey,
  decodeTelemetry,
  decodeUnlockResult,
  encodeDrive,
  encodeTelemetry,
  encodeUnlockResult,
  formatInfo,
  isNewerSequence,
  parseInfo,
  type DriveMessage,
  type RobotInfo,
  type Telemetry,
  type UnlockResult,
} from './protocol'
import { HireKeyRefused, type RobotLink } from './RobotLink'

/**
 * A pretend Mulligan behind RobotLink, so the Drive tab can be built before
 * the robot exists. The firmware half (`SimulatedFirmware`) only sees bytes, as
 * a real robot would: Drive and Unlock writes in, Telemetry notifications out.
 * The lane, pickup and lane limit are ported from the site demo
 * (apps/site/index.html, "drive"), in metres instead of pixels.
 *
 * The safety rules follow the R0 firmware's safety core (safety.cpp on the
 * firmware branch), in its order: stop switch, link timeout, faults, battery,
 * lane limit, speed cap.
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
  // Drive figures from the R0 firmware's limits.
  /** m/s, 4 km/h: full stick, and the cap on either side. */
  topSpeed: 1.11,
  accel: 1.0,
  brake: 2.5,
  /** rad/s at full sideways stick, robot terms: a pivot at 85°/s. */
  turnRate: (85 * Math.PI) / 180,
  /** Half the distance between the left and right wheels, m. */
  halfTrack: 0.185,
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

/** The firmware's ramp: brake toward zero at the brake rate, speed up at the accel rate. */
function ramp(current: number, target: number, dt: number): number {
  const slowing = current !== 0 && (Math.sign(target) !== Math.sign(current) || Math.abs(target) < Math.abs(current))
  if (slowing) {
    const stopAt = Math.sign(target) === Math.sign(current) ? target : 0
    const step = SIM_DEFAULTS.brake * dt
    if (Math.abs(stopAt - current) <= step) return stopAt
    return current > stopAt ? current - step : current + step
  }
  const step = SIM_DEFAULTS.accel * dt
  if (Math.abs(target - current) <= step) return target
  return target > current ? current + step : current - step
}

/** A tilt or a silent sensor must go away before a fault can clear; a stall needs only the clear. */
const LASTING_FAULTS = FAULT.tilt | FAULT.sensor

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
  /** What reading Unlock gives: the result of the last key on this connection. */
  private unlockResult: UnlockResult = 'bad_length'
  private lastSeq: number | null = null
  private command: DriveMessage = { seq: 0, x: 0, y: 0, thumb: false, clearFault: false }
  private sinceDriveMs = 0
  private linkLost = false
  private stopSwitch = false
  /** Set by the stop switch or a new fault: the stick must be let go before driving again. */
  private needRelease = false
  /** Latched faults, and the conditions causing them now. */
  private faults = 0
  private faultCauses = 0
  /** Latches until restart, as in the firmware. */
  private lowBattery = false
  private limits = 0
  private mayDrive = false

  private x: number
  private y: number
  private heading: number
  /** Range terms: one speed along `moveDirection`. */
  private speed = 0
  /** Robot terms: the two sides, m/s. */
  private left = 0
  private right = 0
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

  /**
   * An Unlock write. The write always succeeds, as on the R0 firmware; the
   * result is read back from Unlock (firmware ADR 0005). Locks on any failure.
   */
  async writeUnlock(bytes: Uint8Array): Promise<void> {
    const result = await checkHireKey(bytes, { serial: this.serial, nowUnix: this.nowUnix(), verifier: this.verifier })
    if (result === 'ok') {
      this.lock()
      this.unlockedUntil = decodeHireKey(bytes)!.end
    } else {
      this.lock()
    }
    this.unlockResult = result
  }

  readUnlock(): Uint8Array {
    return encodeUnlockResult(this.unlockResult)
  }

  /** Lock, brake, and start a fresh sequence with no stick. */
  lock(): void {
    this.unlockedUntil = null
    this.lastSeq = null
    this.command = { seq: 0, x: 0, y: 0, thumb: false, clearFault: false }
    this.linkLost = false
  }

  /** The phone went away. The next connection starts with no key result. */
  disconnected(): void {
    this.lock()
    this.unlockResult = 'bad_length'
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
    if (!message.thumb) {
      this.needRelease = false
      if (message.clearFault && this.faults !== 0 && (this.faultCauses & LASTING_FAULTS) === 0) {
        this.faults = 0
        this.faultCauses = 0
      }
    }
  }

  /** Nothing moves while it is pressed, nor after, until the stick is let go. */
  setStopSwitch(pressed: boolean): void {
    this.stopSwitch = pressed
    if (pressed) this.needRelease = true
  }

  /**
   * What is wrong right now (FAULT bits). Faults latch; setting 0 removes the
   * cause, after which a clear-fault message clears them.
   */
  setFaults(bits: number): void {
    this.faultCauses = bits
    if ((this.faults | bits) !== this.faults) this.needRelease = true
    this.faults |= bits
  }

  telemetryBytes(): Uint8Array {
    return encodeTelemetry(this.telemetry())
  }

  private telemetry(): Telemetry {
    return {
      state: this.state(),
      batteryPercent: this.battery,
      ballsOnBoard: this.onBoard,
      faults: this.faults | (this.lowBattery ? FAULT.lowVoltage : 0),
      distanceDm: Math.hypot(this.x, this.y) * 10,
      limits: this.limits,
      lastSeq: this.lastSeq ?? 0,
    }
  }

  /** In the firmware's order. */
  private state(): RobotState {
    if (this.stopSwitch) return RobotState.StoppedBySwitch
    if (this.faults) return RobotState.Fault
    if (this.lowBattery) return RobotState.LowBattery
    if (this.locked) return RobotState.Locked
    if (this.linkLost) return RobotState.LinkLost
    if (this.mayDrive && this.limits) return RobotState.AtLimit
    return this.mayDrive || this.moving() ? RobotState.Driving : RobotState.Idle
  }

  private moving(): boolean {
    return this.speed !== 0 || this.left !== 0 || this.right !== 0
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

  /** Advance the world by `ms`, applying the safety rules in the firmware's order. */
  step(ms: number): void {
    const dt = ms / 1000
    if (this.unlockedUntil !== null && this.nowUnix() >= this.unlockedUntil) this.lock()
    if (this.battery < SIM_DEFAULTS.lowBattery) this.lowBattery = true

    this.sinceDriveMs += ms
    const stick = this.command
    const held = !this.locked && stick.thumb
    // 1. Stop switch (needRelease is set when it is pressed). 2. Link timeout.
    if (held && this.sinceDriveMs > SIM_DEFAULTS.watchdogMs) this.linkLost = true
    // 3. Faults. 4. Battery.
    const immediateStop = this.stopSwitch || this.faults !== 0
    this.mayDrive = held && !this.needRelease && !this.linkLost && !immediateStop && !this.lowBattery

    let limits = 0
    if (this.steering === 'robot') {
      let targetLeft = 0
      let targetRight = 0
      if (this.mayDrive) {
        const forward = (stick.y / 100) * SIM_DEFAULTS.topSpeed
        const turnRight = (stick.x / 100) * SIM_DEFAULTS.turnRate
        targetLeft = forward + turnRight * SIM_DEFAULTS.halfTrack
        targetRight = forward - turnRight * SIM_DEFAULTS.halfTrack
        // 6. Speed cap: scale both sides together so the turn keeps its shape.
        const fastest = Math.max(Math.abs(targetLeft), Math.abs(targetRight))
        if (fastest > SIM_DEFAULTS.topSpeed + 1e-4) {
          targetLeft *= SIM_DEFAULTS.topSpeed / fastest
          targetRight *= SIM_DEFAULTS.topSpeed / fastest
          limits |= LIMIT.speed
        }
      }
      this.left = immediateStop ? 0 : ramp(this.left, targetLeft, dt)
      this.right = immediateStop ? 0 : ramp(this.right, targetRight, dt)
      this.heading -= ((this.left - this.right) / (2 * SIM_DEFAULTS.halfTrack)) * dt
      this.moveDirection = this.heading
      this.speed = 0
    } else {
      let target = 0
      if (this.mayDrive && (stick.x !== 0 || stick.y !== 0)) {
        const magnitude = Math.min(1, Math.hypot(stick.x, stick.y) / 100)
        const direction = Math.atan2(stick.y, stick.x)
        this.heading = turnToward(this.heading, direction, SIM_DEFAULTS.rangeTurnRate * dt)
        this.moveDirection = direction
        target = magnitude * SIM_DEFAULTS.topSpeed
      }
      this.speed = immediateStop ? 0 : ramp(this.speed, target, dt)
    }

    const forwardSpeed = this.steering === 'robot' ? (this.left + this.right) / 2 : this.speed
    const nextX = this.x + Math.cos(this.moveDirection) * forwardSpeed * dt
    const nextY = this.y + Math.sin(this.moveDirection) * forwardSpeed * dt
    // 5. Lane limit.
    const edge = this.lane.halfWidth - SIM_DEFAULTS.bodyRadius
    if (nextX < -edge) limits |= LIMIT.leftEdge
    if (nextX > edge) limits |= LIMIT.rightEdge
    if (nextY > this.lane.far) limits |= LIMIT.farEnd
    this.x = Math.max(-edge, Math.min(edge, nextX))
    // The bay is behind the robot; it stops there without calling it a limit.
    this.y = Math.max(0, Math.min(this.lane.far, nextY))
    this.limits = this.mayDrive ? limits : 0

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
    if (home && this.onBoard > 0 && !this.moving()) {
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
    const rate = this.moving() ? SIM_DEFAULTS.drainDriving : SIM_DEFAULTS.drainIdle
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
    // Write the key, then read Unlock back for the result, as the app must with
    // the R0 firmware (ADR 0005). The simulator has checked it by the time the write resolves.
    await this.firmware.writeUnlock(hireKey)
    const result = decodeUnlockResult(this.firmware.readUnlock()) ?? 'unknown'
    if (result !== 'ok') {
      this.isConnected = false
      this.firmware.disconnected()
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
    this.firmware.disconnected()
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

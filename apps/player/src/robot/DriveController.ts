import { STICK_MAX, type DriveMessage } from './protocol'
import type { RobotLink } from './RobotLink'

/** The app's side of the control link rules (robot/README.md, "Rules"). */
export const DRIVE_INTERVAL_MS = 50 // 20 times a second
export const RELEASE_MESSAGES = 3

function toStick(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(-1, Math.min(1, value)) * STICK_MAX)
}

/**
 * Turns a thumb on a stick into Drive messages:
 * - while held, one at once and then 20 a second, each with the next sequence
 *   number, wrapping at 255;
 * - on release, three with x and y at zero and the thumb flag clear, 50 ms
 *   apart, then silence. The robot brakes on the first; if all three are lost,
 *   its 300 ms backstop stops it anyway.
 */
export class DriveController {
  private seq = 0
  private stick = { x: 0, y: 0 }
  private holdTimer: ReturnType<typeof setInterval> | null = null
  private releaseTimer: ReturnType<typeof setInterval> | null = null
  private clearing = false

  constructor(
    private readonly link: RobotLink,
    private readonly intervalMs: number = DRIVE_INTERVAL_MS,
  ) {}

  get holding(): boolean {
    return this.holdTimer !== null
  }

  /** The stick, each axis -1..1: x right, y forward. */
  hold(x: number, y: number): void {
    this.stick = { x: toStick(x), y: toStick(y) }
    if (this.holdTimer !== null) return
    this.cancelRelease()
    this.clearing = false
    this.send(true)
    this.holdTimer = setInterval(() => this.send(true), this.intervalMs)
  }

  /**
   * Ask the robot to clear a latched fault (firmware ADR 0003): a release whose
   * three messages also carry the clear-fault flag. The robot only clears it
   * once the cause has gone.
   */
  clearFault(): void {
    this.clearing = true
    this.release()
  }

  release(): void {
    if (this.holdTimer !== null) clearInterval(this.holdTimer)
    this.holdTimer = null
    this.stick = { x: 0, y: 0 }
    this.cancelRelease()
    let left = RELEASE_MESSAGES
    const sendOne = () => {
      this.send(false)
      left--
      if (left === 0) {
        this.cancelRelease()
        this.clearing = false
      }
    }
    sendOne()
    if (left > 0) this.releaseTimer = setInterval(sendOne, this.intervalMs)
  }

  dispose(): void {
    this.release()
  }

  private cancelRelease(): void {
    if (this.releaseTimer !== null) clearInterval(this.releaseTimer)
    this.releaseTimer = null
  }

  private send(thumb: boolean): void {
    this.seq = (this.seq + 1) & 0xff
    const message: DriveMessage = thumb
      ? { seq: this.seq, x: this.stick.x, y: this.stick.y, thumb: true, clearFault: false }
      : { seq: this.seq, x: 0, y: 0, thumb: false, clearFault: this.clearing }
    this.link.sendDrive(message)
  }
}

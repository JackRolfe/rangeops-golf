import type { DriveMessage, RobotInfo, Telemetry, UnlockResult } from './protocol'

export type { DriveMessage, RobotInfo, Telemetry } from './protocol'

/**
 * The app's one way of talking to a Mulligan. Every method maps onto a
 * characteristic of the control link (robot/README.md):
 *
 * - `connect` connects, reads Info, writes the hire key to Unlock, waits about
 *   100 ms and reads Unlock back for the result (firmware ADR 0005).
 * - `sendDrive` writes Drive. Callers use DriveController, which owns the
 *   rate, sequence and release rules, rather than calling this directly.
 * - `onTelemetry` subscribes to Telemetry notifications.
 *
 * SimulatedRobot implements it today; BleRobot will in stage 3.
 */
export interface RobotLink {
  /** Resolves with the robot's Info once it has accepted the key; rejects with HireKeyRefused if not. */
  connect(hireKey: Uint8Array): Promise<RobotInfo>
  sendDrive(message: DriveMessage): void
  /** Returns a function that unsubscribes. */
  onTelemetry(listener: (telemetry: Telemetry) => void): () => void
  disconnect(): Promise<void>
  readonly connected: boolean
}

/** Why a robot would not unlock, as read back from Unlock; `unknown` if the read fails. */
export type RefusalReason = Exclude<UnlockResult, 'ok'> | 'unknown'

export class HireKeyRefused extends Error {
  readonly reason: RefusalReason

  constructor(reason: RefusalReason) {
    super(`The robot refused the hire key (${reason}).`)
    this.name = 'HireKeyRefused'
    this.reason = reason
  }
}

/**
 * The control link: the messages the app and Mulligan exchange over Bluetooth
 * LE, byte for byte as in robot/README.md ("Control link (draft)") and the
 * firmware's link.h. Everything here is pure: bytes in, fields out.
 */

export const CONTROL_LINK_UUIDS = {
  service: '618deb21-0248-48ee-8de9-e8d739eba464',
  drive: '618deb22-0248-48ee-8de9-e8d739eba464',
  telemetry: '618deb23-0248-48ee-8de9-e8d739eba464',
  info: '618deb24-0248-48ee-8de9-e8d739eba464',
  unlock: '618deb25-0248-48ee-8de9-e8d739eba464',
} as const

export const SERIAL_LENGTH = 4
export const DRIVE_LENGTH = 4
export const TELEMETRY_LENGTH = 8
export const HIRE_KEY_BODY_LENGTH = 14
export const HIRE_KEY_SIGNATURE_LENGTH = 64
export const HIRE_KEY_LENGTH = HIRE_KEY_BODY_LENGTH + HIRE_KEY_SIGNATURE_LENGTH
export const HIRE_KEY_VERSION = 1
export const STICK_MAX = 100
export const BALLS_NOT_COUNTED = 255
export const DISTANCE_UNKNOWN = 0xffff

const DRIVE_FLAG_THUMB = 0x01
/** Proposed in firmware ADR 0003, implemented in the R0 firmware; not yet in robot/README.md. */
const DRIVE_FLAG_CLEAR_FAULT = 0x02

/** App to robot, 20 times a second while the stick is held. */
export interface DriveMessage {
  /** 0..255, counting up and wrapping. */
  seq: number
  /** -100..100, right is positive. */
  x: number
  /** -100..100, forward is positive. */
  y: number
  /** Flag bit 0: a thumb is on the stick. */
  thumb: boolean
  /**
   * Flag bit 1: clear a latched fault. Sent with `thumb` false while telemetry
   * says Fault; the robot clears it only once the cause has gone (firmware ADR 0003).
   */
  clearFault: boolean
}

export const RobotState = {
  Idle: 0,
  Driving: 1,
  AtLimit: 2,
  LinkLost: 3,
  StoppedBySwitch: 4,
  Fault: 5,
  LowBattery: 6,
  Locked: 7,
} as const
export type RobotState = (typeof RobotState)[keyof typeof RobotState]

export const FAULT = { stall: 0x01, tilt: 0x02, sensor: 0x04, lowVoltage: 0x08 } as const
export const LIMIT = { farEnd: 0x01, leftEdge: 0x02, rightEdge: 0x04, speed: 0x08 } as const

/** Robot to app, 5 times a second. */
export interface Telemetry {
  state: RobotState
  batteryPercent: number
  /** null when the robot does not count balls (255 on the wire). */
  ballsOnBoard: number | null
  /** FAULT bits. */
  faults: number
  /** Distance from where it was zeroed, in decimetres; null when unknown (65535). */
  distanceDm: number | null
  /** LIMIT bits, set while a limit is overriding the stick. */
  limits: number
  /** The sequence number of the last Drive message the robot acted on. */
  lastSeq: number
}

export interface HireKeyFields {
  version: number
  /** The robot's four serial characters, as in `Mulligan-XXXX`. */
  serial: string
  /** Unix seconds; the key is valid while start <= now < end. */
  start: number
  end: number
  bay: number
}

export interface HireKey extends HireKeyFields {
  signature: Uint8Array
}

export interface RobotInfo {
  name: string
  serial: string
  firmware: string
  hardware: string
}

const isByte = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 255
const isStick = (value: number): boolean => Number.isInteger(value) && Math.abs(value) <= STICK_MAX
const isU32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffffffff

export function encodeDrive(message: DriveMessage): Uint8Array {
  if (!isByte(message.seq)) throw new RangeError('Drive sequence must be 0..255.')
  if (!isStick(message.x) || !isStick(message.y)) throw new RangeError('Stick values must be whole numbers in -100..100.')
  const bytes = new Uint8Array(DRIVE_LENGTH)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, message.seq)
  view.setInt8(1, message.x)
  view.setInt8(2, message.y)
  view.setUint8(3, (message.thumb ? DRIVE_FLAG_THUMB : 0) | (message.clearFault ? DRIVE_FLAG_CLEAR_FAULT : 0))
  return bytes
}

/** Null unless exactly four bytes with both stick values inside -100..100. */
export function decodeDrive(bytes: Uint8Array): DriveMessage | null {
  if (bytes.length !== DRIVE_LENGTH) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const x = view.getInt8(1)
  const y = view.getInt8(2)
  if (!isStick(x) || !isStick(y)) return null
  const flags = view.getUint8(3)
  return {
    seq: view.getUint8(0),
    x,
    y,
    thumb: (flags & DRIVE_FLAG_THUMB) !== 0,
    clearFault: (flags & DRIVE_FLAG_CLEAR_FAULT) !== 0,
  }
}

export function encodeTelemetry(telemetry: Telemetry): Uint8Array {
  const bytes = new Uint8Array(TELEMETRY_LENGTH)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, telemetry.state)
  view.setUint8(1, Math.max(0, Math.min(100, Math.round(telemetry.batteryPercent))))
  view.setUint8(2, telemetry.ballsOnBoard ?? BALLS_NOT_COUNTED)
  view.setUint8(3, telemetry.faults & 0xff)
  view.setUint16(4, telemetry.distanceDm === null ? DISTANCE_UNKNOWN : Math.min(DISTANCE_UNKNOWN - 1, Math.round(telemetry.distanceDm)), true)
  view.setUint8(6, telemetry.limits & 0xff)
  view.setUint8(7, telemetry.lastSeq & 0xff)
  return bytes
}

export function decodeTelemetry(bytes: Uint8Array): Telemetry | null {
  if (bytes.length !== TELEMETRY_LENGTH) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const state = view.getUint8(0)
  if (state > RobotState.Locked) return null
  const balls = view.getUint8(2)
  const distance = view.getUint16(4, true)
  return {
    state: state as RobotState,
    batteryPercent: view.getUint8(1),
    ballsOnBoard: balls === BALLS_NOT_COUNTED ? null : balls,
    faults: view.getUint8(3),
    distanceDm: distance === DISTANCE_UNKNOWN ? null : distance,
    limits: view.getUint8(6),
    lastSeq: view.getUint8(7),
  }
}

/** Bytes 0..13 of a hire key: what the signature covers. */
export function hireKeyBody(fields: HireKeyFields): Uint8Array {
  if (fields.serial.length !== SERIAL_LENGTH || !/^[\x20-\x7e]+$/.test(fields.serial)) {
    throw new RangeError('A serial is four printable ASCII characters.')
  }
  if (!isByte(fields.version) || !isByte(fields.bay)) throw new RangeError('Version and bay must be 0..255.')
  if (!isU32(fields.start) || !isU32(fields.end)) throw new RangeError('Hire times must be unsigned 32-bit Unix seconds.')
  const bytes = new Uint8Array(HIRE_KEY_BODY_LENGTH)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, fields.version)
  for (let index = 0; index < SERIAL_LENGTH; index++) view.setUint8(1 + index, fields.serial.charCodeAt(index))
  view.setUint32(5, fields.start, true)
  view.setUint32(9, fields.end, true)
  view.setUint8(13, fields.bay)
  return bytes
}

export function encodeHireKey(fields: HireKeyFields, signature: Uint8Array): Uint8Array {
  if (signature.length !== HIRE_KEY_SIGNATURE_LENGTH) throw new RangeError('A hire key signature is 64 bytes.')
  const bytes = new Uint8Array(HIRE_KEY_LENGTH)
  bytes.set(hireKeyBody(fields), 0)
  bytes.set(signature, HIRE_KEY_BODY_LENGTH)
  return bytes
}

/** Reads the fields without checking anything. Null unless 78 bytes. */
export function decodeHireKey(bytes: Uint8Array): HireKey | null {
  if (bytes.length !== HIRE_KEY_LENGTH) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    version: view.getUint8(0),
    serial: String.fromCharCode(...bytes.subarray(1, 1 + SERIAL_LENGTH)),
    start: view.getUint32(5, true),
    end: view.getUint32(9, true),
    bay: view.getUint8(13),
    signature: bytes.slice(HIRE_KEY_BODY_LENGTH),
  }
}

/**
 * Reading Unlock gives one byte: the result of the last key written on this
 * connection (firmware ADR 0005). The write itself always succeeds, so the app
 * writes the key, waits about 100 ms and reads this back. Before any key is
 * written it reads `bad_length`.
 */
export const UNLOCK_RESULTS = [
  'ok',
  'bad_length',
  'bad_version',
  'bad_signature',
  'wrong_serial',
  'not_yet',
  'expired',
  'no_clock',
] as const
export type UnlockResult = (typeof UNLOCK_RESULTS)[number]

export function encodeUnlockResult(result: UnlockResult): Uint8Array {
  return new Uint8Array([UNLOCK_RESULTS.indexOf(result)])
}

/** Null unless one byte with a known value. */
export function decodeUnlockResult(bytes: Uint8Array): UnlockResult | null {
  if (bytes.length !== 1) return null
  return UNLOCK_RESULTS[bytes[0]] ?? null
}

/** Newer means ahead by 1 to 127, wrapping at 255, as the firmware's SequenceFilter. */
export function isNewerSequence(seq: number, last: number): boolean {
  const ahead = (seq - last) & 0xff
  return ahead >= 1 && ahead <= 127
}

export function advertisedName(serial: string): string {
  return `Mulligan-${serial}`
}

/** The Info characteristic: "Mulligan-A1B2;0.1.0;R0". */
export function parseInfo(text: string): RobotInfo | null {
  const parts = text.split(';')
  if (parts.length !== 3) return null
  const [name, firmware, hardware] = parts
  const match = /^Mulligan-(.{4})$/.exec(name)
  if (!match) return null
  return { name, serial: match[1], firmware, hardware }
}

export function formatInfo(info: Omit<RobotInfo, 'name'>): string {
  return `${advertisedName(info.serial)};${info.firmware};${info.hardware}`
}

/** Hire keys travel in links as base64url, without padding. */
export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Null if it isn't base64url. */
export function base64urlToBytes(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))
}

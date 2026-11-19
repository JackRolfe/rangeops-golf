import { describe, expect, it } from 'vitest'
import {
  CONTROL_LINK_UUIDS,
  DISTANCE_UNKNOWN,
  FAULT,
  HIRE_KEY_LENGTH,
  LIMIT,
  RobotState,
  advertisedName,
  decodeDrive,
  decodeHireKey,
  decodeTelemetry,
  encodeDrive,
  encodeHireKey,
  encodeTelemetry,
  hireKeyBody,
  isNewerSequence,
  parseInfo,
  type Telemetry,
} from './protocol'

const toHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

describe('control link UUIDs', () => {
  it('match robot/README.md', () => {
    expect(CONTROL_LINK_UUIDS).toEqual({
      service: '618deb21-0248-48ee-8de9-e8d739eba464',
      drive: '618deb22-0248-48ee-8de9-e8d739eba464',
      telemetry: '618deb23-0248-48ee-8de9-e8d739eba464',
      info: '618deb24-0248-48ee-8de9-e8d739eba464',
      unlock: '618deb25-0248-48ee-8de9-e8d739eba464',
    })
  })
})

describe('Drive, 4 bytes', () => {
  it('lays out sequence, signed x and y, and the thumb flag', () => {
    expect([...encodeDrive({ seq: 7, x: -100, y: 100, thumb: true })]).toEqual([7, 0x9c, 100, 1])
    expect([...encodeDrive({ seq: 255, x: 0, y: -1, thumb: false })]).toEqual([255, 0, 0xff, 0])
  })

  it('round-trips', () => {
    const message = { seq: 200, x: 42, y: -37, thumb: true }
    expect(decodeDrive(encodeDrive(message))).toEqual(message)
  })

  it('rejects the wrong length and sticks outside -100..100', () => {
    expect(decodeDrive(new Uint8Array([1, 0, 0]))).toBeNull()
    expect(decodeDrive(new Uint8Array([1, 0, 0, 0, 0]))).toBeNull()
    expect(decodeDrive(new Uint8Array([1, 101, 0, 1]))).toBeNull()
    expect(decodeDrive(new Uint8Array([1, 0, 0x9b, 1]))).toBeNull() // -101
    expect(() => encodeDrive({ seq: 1, x: 120, y: 0, thumb: true })).toThrow(RangeError)
    expect(() => encodeDrive({ seq: 256, x: 0, y: 0, thumb: true })).toThrow(RangeError)
  })
})

describe('Telemetry, 8 bytes', () => {
  const telemetry: Telemetry = {
    state: RobotState.AtLimit,
    batteryPercent: 82,
    ballsOnBoard: 4,
    faults: FAULT.tilt | FAULT.lowVoltage,
    distanceDm: 0x1234,
    limits: LIMIT.farEnd | LIMIT.speed,
    lastSeq: 250,
  }

  it('lays out every field, distance low byte first', () => {
    expect([...encodeTelemetry(telemetry)]).toEqual([2, 82, 4, 0b1010, 0x34, 0x12, 0b1001, 250])
  })

  it('round-trips, including unknown balls and distance', () => {
    expect(decodeTelemetry(encodeTelemetry(telemetry))).toEqual(telemetry)
    const unknown = { ...telemetry, ballsOnBoard: null, distanceDm: null }
    const bytes = encodeTelemetry(unknown)
    expect(bytes[2]).toBe(255)
    expect([bytes[4], bytes[5]]).toEqual([0xff, 0xff])
    expect(DISTANCE_UNKNOWN).toBe(0xffff)
    expect(decodeTelemetry(bytes)).toEqual(unknown)
  })

  it('rejects the wrong length and unknown states', () => {
    expect(decodeTelemetry(new Uint8Array(7))).toBeNull()
    expect(decodeTelemetry(new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })

  it('numbers the states as the README does', () => {
    expect(RobotState).toEqual({
      Idle: 0,
      Driving: 1,
      AtLimit: 2,
      LinkLost: 3,
      StoppedBySwitch: 4,
      Fault: 5,
      LowBattery: 6,
      Locked: 7,
    })
    expect(FAULT).toEqual({ stall: 1, tilt: 2, sensor: 4, lowVoltage: 8 })
    expect(LIMIT).toEqual({ farEnd: 1, leftEdge: 2, rightEdge: 4, speed: 8 })
  })
})

describe('hire key, 78 bytes', () => {
  const fields = { version: 1, serial: 'A1B2', start: 1798761600, end: 1798765200, bay: 3 }
  const signature = new Uint8Array(64).map((_, index) => index)

  it('matches the shared test vector layout', () => {
    // ok_mid_hire from robot/firmware/test/vectors/hire_keys.json, first 14 bytes.
    expect(toHex(hireKeyBody(fields))).toBe('0141314232' + '80ec366b' + '90fa366b' + '03')
  })

  it('round-trips, including times past 2^31', () => {
    const key = encodeHireKey(fields, signature)
    expect(key).toHaveLength(HIRE_KEY_LENGTH)
    expect(decodeHireKey(key)).toEqual({ ...fields, signature })
    const late = { ...fields, start: 2147483000, end: 4294967295, bay: 255 }
    expect(decodeHireKey(encodeHireKey(late, signature))).toMatchObject(late)
  })

  it('rejects the wrong length and bad serials', () => {
    expect(decodeHireKey(new Uint8Array(77))).toBeNull()
    expect(decodeHireKey(new Uint8Array(79))).toBeNull()
    expect(() => hireKeyBody({ ...fields, serial: 'A1B' })).toThrow(RangeError)
    expect(() => encodeHireKey(fields, new Uint8Array(63))).toThrow(RangeError)
  })
})

describe('sequence numbers', () => {
  it('counts a message as newer when it is 1 to 127 ahead, wrapping at 255', () => {
    expect(isNewerSequence(1, 0)).toBe(true)
    expect(isNewerSequence(127, 0)).toBe(true)
    expect(isNewerSequence(128, 0)).toBe(false)
    expect(isNewerSequence(0, 255)).toBe(true)
    expect(isNewerSequence(5, 250)).toBe(true)
    expect(isNewerSequence(5, 5)).toBe(false)
    expect(isNewerSequence(4, 5)).toBe(false)
  })
})

describe('Info and names', () => {
  it('parses the Info text and names a robot by its serial', () => {
    expect(parseInfo('Mulligan-A1B2;0.1.0;R0')).toEqual({
      name: 'Mulligan-A1B2',
      serial: 'A1B2',
      firmware: '0.1.0',
      hardware: 'R0',
    })
    expect(parseInfo('nonsense')).toBeNull()
    expect(advertisedName('A1B2')).toBe('Mulligan-A1B2')
  })
})

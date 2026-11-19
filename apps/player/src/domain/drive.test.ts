import { describe, expect, it } from 'vitest'
import { FAULT, LIMIT, RobotState, type Telemetry } from '../robot/protocol'
import { driveMessage, refusalMessage } from './drive'

const base: Telemetry = {
  state: RobotState.Idle,
  batteryPercent: 80,
  ballsOnBoard: 0,
  faults: 0,
  distanceDm: 0,
  limits: 0,
  lastSeq: 0,
}
const at = (patch: Partial<Telemetry>) => driveMessage({ ...base, ...patch })

describe('driveMessage', () => {
  it('explains each state', () => {
    expect(driveMessage(null)).toMatch(/Connecting/)
    expect(at({})).toBe('Hold the stick to drive out and scoop the balls.')
    expect(at({ state: RobotState.Driving, limits: LIMIT.speed })).toBe('Driving at walking pace. Let go and it stops.')
    expect(at({ ballsOnBoard: 3 })).toBe('Stopped. 3 on board.')
    expect(at({ ballsOnBoard: 10, state: RobotState.Driving })).toBe('Full. Bring them back to the bay.')
    expect(at({ state: RobotState.Locked })).toMatch(/locked/)
    expect(at({ state: RobotState.LinkLost })).toMatch(/Lost the signal/)
    expect(at({ state: RobotState.StoppedBySwitch })).toMatch(/switch/)
    expect(at({ state: RobotState.LowBattery })).toMatch(/Battery low/)
  })

  it('names the limit that is holding the robot', () => {
    expect(at({ state: RobotState.AtLimit, limits: LIMIT.farEnd })).toBe('Far limit. Mulligan goes no further from the bay.')
    expect(at({ state: RobotState.AtLimit, limits: LIMIT.leftEdge })).toBe('Lane limit. Mulligan stays in front of its own bay.')
    expect(at({ state: RobotState.AtLimit, limits: LIMIT.rightEdge | LIMIT.speed })).toMatch(/Lane limit/)
  })

  it('names the fault', () => {
    expect(at({ state: RobotState.Fault, faults: FAULT.tilt })).toMatch(/tipped/)
    expect(at({ state: RobotState.Fault, faults: FAULT.stall })).toMatch(/stuck/)
    expect(at({ state: RobotState.Fault, faults: FAULT.sensor })).toMatch(/stopped working/)
  })

  it('explains a refused key', () => {
    expect(refusalMessage('expired')).toMatch(/hire has ended/)
    expect(refusalMessage('not_yet')).toMatch(/hasn’t started/)
    expect(refusalMessage('wrong_serial')).toMatch(/different robot/)
    expect(refusalMessage('unknown')).toMatch(/didn’t accept/)
  })
})

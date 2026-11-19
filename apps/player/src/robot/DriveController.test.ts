import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveController } from './DriveController'
import { issueBenchKey } from './hireKey'
import { RobotState, type DriveMessage, type Telemetry } from './protocol'
import type { RobotLink } from './RobotLink'
import { SimulatedRobot } from './SimulatedRobot'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function recordingLink() {
  const sent: DriveMessage[] = []
  const link: RobotLink = {
    connected: true,
    connect: async () => ({ name: 'Mulligan-TEST', serial: 'TEST', firmware: '0', hardware: '0' }),
    sendDrive: (message) => sent.push(message),
    onTelemetry: () => () => {},
    disconnect: async () => {},
  }
  return { link, sent }
}

describe('DriveController', () => {
  it('sends at once and then 20 times a second while held', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(0.5, 1)
    expect(sent).toEqual([{ seq: 1, x: 50, y: 100, thumb: true, clearFault: false }])
    vi.advanceTimersByTime(1000)
    expect(sent).toHaveLength(21)
    controller.hold(-0.25, 0)
    vi.advanceTimersByTime(50)
    expect(sent[sent.length - 1]).toEqual({ seq: 22, x: -25, y: 0, thumb: true, clearFault: false })
  })

  it('rounds and clamps the stick to -100..100', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(1.7, -0.333)
    expect(sent[0]).toMatchObject({ x: 100, y: -33 })
    controller.hold(Number.NaN, -2)
    vi.advanceTimersByTime(50)
    expect(sent[1]).toMatchObject({ x: 0, y: -100 })
  })

  it('wraps the sequence number at 255', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(0, 1)
    vi.advanceTimersByTime(50 * 260)
    expect(sent.slice(254, 258).map(({ seq }) => seq)).toEqual([255, 0, 1, 2])
  })

  it('on release sends three zero messages with the thumb flag clear, 50 ms apart, then nothing', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(0, 1)
    vi.advanceTimersByTime(100)
    const held = sent.length
    controller.release()
    expect(sent.slice(held)).toEqual([{ seq: held + 1, x: 0, y: 0, thumb: false, clearFault: false }])
    vi.advanceTimersByTime(100)
    expect(sent.slice(held).map(({ x, y, thumb }) => [x, y, thumb])).toEqual([
      [0, 0, false],
      [0, 0, false],
      [0, 0, false],
    ])
    vi.advanceTimersByTime(5000)
    expect(sent).toHaveLength(held + 3)
    expect(controller.holding).toBe(false)
  })

  it('stops a release when the stick is held again', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(0, 1)
    controller.release()
    controller.hold(0, 1)
    vi.advanceTimersByTime(100)
    expect(sent.map(({ thumb }) => thumb)).toEqual([true, false, true, true, true])
  })

  it('asks the robot to clear a fault with the thumb flag clear', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.clearFault()
    vi.advanceTimersByTime(500)
    expect(sent.map(({ thumb, clearFault, x, y }) => [thumb, clearFault, x, y])).toEqual([
      [false, true, 0, 0],
      [false, true, 0, 0],
      [false, true, 0, 0],
    ])
    controller.hold(0, 1)
    controller.release()
    expect(sent.slice(3).map(({ clearFault }) => clearFault)).toEqual([false, false])
  })

  it('releases when disposed', () => {
    const { link, sent } = recordingLink()
    const controller = new DriveController(link)
    controller.hold(0, 1)
    controller.dispose()
    vi.advanceTimersByTime(1000)
    expect(sent.slice(1).every(({ thumb }) => !thumb)).toBe(true)
    expect(sent).toHaveLength(4)
  })
})

describe('DriveController with the simulated robot', () => {
  it('drives, stops on release and never trips the 300 ms backstop', async () => {
    vi.useRealTimers()
    const key = await issueBenchKey({ serial: 'SIM1', bay: 7, start: 1_800_000_000 - 60, end: 1_800_003_600 })
    vi.useFakeTimers()
    const robot = new SimulatedRobot({ autoRun: false, balls: [], nowUnix: () => 1_800_000_000 })
    const states: number[] = []
    robot.onTelemetry((telemetry: Telemetry) => states.push(telemetry.state))
    await robot.connect(key)
    const controller = new DriveController(robot)
    const run = (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 10) {
        vi.advanceTimersByTime(10)
        robot.advance(10)
      }
    }
    controller.hold(0, 1)
    run(2000)
    expect(robot.world().robot.y).toBeGreaterThan(1.5)
    controller.release()
    run(2000)
    const stopped = robot.world().robot.y
    run(1000)
    expect(robot.world().robot.y).toBe(stopped)
    expect(states).toContain(RobotState.Driving)
    expect(states).not.toContain(RobotState.LinkLost)
    expect(states[states.length - 1]).toBe(RobotState.Idle)
  })
})

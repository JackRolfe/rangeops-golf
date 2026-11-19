import type { RefusalReason } from '../robot/RobotLink'
import { FAULT, LIMIT, RobotState, type Telemetry } from '../robot/protocol'

/** One plain sentence for what Mulligan is doing, from its telemetry. */
export function driveMessage(telemetry: Telemetry | null, capacity = 10): string {
  if (!telemetry) return 'Connecting to Mulligan…'
  const { state, faults, limits, ballsOnBoard } = telemetry
  switch (state) {
    case RobotState.Locked:
      return 'Mulligan is locked. It needs a hire key for this bay.'
    case RobotState.StoppedBySwitch:
      return 'Stopped by the switch on Mulligan. Turn it back on to drive.'
    case RobotState.Fault:
      if (faults & FAULT.tilt) return 'Mulligan has tipped over. Set it upright.'
      if (faults & FAULT.stall) return 'Mulligan is stuck. Check its wheels.'
      if (faults & FAULT.lowVoltage) return 'The battery is too low to drive. Swap it at the bay.'
      return 'Something on Mulligan stopped working, so it stopped.'
    case RobotState.LinkLost:
      return 'Lost the signal, so Mulligan stopped. Stay close to the bay.'
    case RobotState.AtLimit:
      if (limits & LIMIT.farEnd) return 'Far limit. Mulligan goes no further from the bay.'
      return 'Lane limit. Mulligan stays in front of its own bay.'
    case RobotState.LowBattery:
      return 'Battery low. Bring Mulligan back to the bay.'
  }
  const onBoard = ballsOnBoard ?? 0
  if (onBoard >= capacity) return 'Full. Bring them back to the bay.'
  if (state === RobotState.Driving) return 'Driving at walking pace. Let go and it stops.'
  if (onBoard > 0) return `Stopped. ${onBoard} on board.`
  return 'Hold the stick to drive out and scoop the balls.'
}

export function refusalMessage(reason: RefusalReason): string {
  switch (reason) {
    case 'expired':
      return 'This hire has ended, so Mulligan won’t drive. Book again to keep going.'
    case 'not_yet':
      return 'This hire hasn’t started yet. Try again at your booking time.'
    case 'wrong_serial':
      return 'This hire key is for a different robot. Check the bay number.'
    default:
      return 'Mulligan didn’t accept this hire key.'
  }
}

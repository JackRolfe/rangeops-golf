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
      if (faults & FAULT.tilt) return 'Mulligan has tipped over. Set it upright, then tap Clear fault.'
      if (faults & FAULT.stall) return 'Mulligan got stuck. Check its wheels, then tap Clear fault.'
      if (faults & FAULT.sensor) return 'A sensor on Mulligan stopped answering, so it stopped. Tap Clear fault to try again.'
      return 'Something on Mulligan stopped working, so it stopped. Tap Clear fault to try again.'
    case RobotState.LinkLost:
      return 'Lost the signal, so Mulligan stopped. Stay close to the bay.'
    case RobotState.AtLimit:
      if (limits & LIMIT.farEnd) return 'Far limit. Mulligan goes no further from the bay.'
      if (limits & (LIMIT.leftEdge | LIMIT.rightEdge)) return 'Lane limit. Mulligan stays in front of its own bay.'
      // Only the speed cap, from full stick with the slightest turn: to a child
      // that's just driving, so say the same as Driving rather than flicker.
      return 'Driving at walking pace. Let go and it stops.'
    case RobotState.LowBattery:
      return 'Battery low, so Mulligan has stopped. Swap the battery at the bay.'
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
    case 'no_clock':
      return 'Mulligan doesn’t know the time yet, so it can’t check the hire. Ask at the counter.'
    default:
      return 'Mulligan didn’t accept this hire key.'
  }
}

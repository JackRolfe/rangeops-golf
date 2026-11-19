# 3. Drive flags bit 1 clears a fault

Status: proposed change to the draft control link, implemented in the R0 firmware, 2026-11-19

## Context

[DESIGN.md](../../robot/DESIGN.md#firmware) says a fault (stall, tilt, sensor) is "cleared from the app", but the [control link](../../robot/README.md#control-link-draft) has no message for it. Clearing a fault automatically when the stick is released would let a stalled robot try again with no one deciding to.

## Decision

Add one flag to the Drive message: **bit 1, clear fault**. The firmware clears a latched fault when it receives a valid Drive message with bit 1 set and bit 0 (thumb on the stick) clear, and only if the cause has gone: the robot is upright and the sensors answer. A stall needs nothing more than the clear, since the wheels are stopped by then. A restart also clears a fault.

The app would send it from a button shown while telemetry reports state 5.

## Consequences

- Needs adding to the control link table in `robot/README.md` and to the app's `RobotLink`. Neither is done here; the app session has been told.
- An app that never sets the bit is unaffected, except that a fault then lasts until the robot restarts.

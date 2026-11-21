# 5. The app reads Unlock back to learn what the robot made of its key

Status: accepted, implemented in the R0 firmware and added to the control link in robot/README.md, 2026-11-19

## Context

The [control link](../../robot/README.md#control-link-draft) makes Unlock a write with response, and the spec meant the robot to refuse a bad key with an ATT error. The ESP32 Arduino Bluetooth library (Bluedroid) answers a write before the firmware's callback runs, and the firmware checks keys on its control loop, not on the Bluetooth task, so it cannot refuse a write at that layer.

## Decision

Unlock is also **readable**. Reading it gives one byte, the result of the last key written on this connection:

| Value | Meaning |
| --- | --- |
| 0 | ok |
| 1 | bad length (also the value before any key is written) |
| 2 | bad version |
| 3 | bad signature |
| 4 | wrong serial: a key for another robot |
| 5 | not yet: the hire has not started |
| 6 | expired |
| 7 | the robot does not know the time |

The write itself always succeeds. Telemetry state 7 also says the robot is still locked.

## Consequences

- The app writes the key, waits about 100 ms (the check runs on the next control tick), reads Unlock and can tell the user why it is still locked, for example "this key is for another robot".
- Needs adding to the control link table in `robot/README.md` and to the app's `RobotLink`. Neither is done here.
- A later move to NimBLE could refuse the write at the ATT layer as well; the read-back can stay.

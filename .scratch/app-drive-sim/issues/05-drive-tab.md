# 05. The Drive tab

Status: resolved
Spec: ../spec.md
Blocked by: 03, 04

## What

- `Joystick` component: drag the knob (pointer events, captured), arrow keys, reports -1..1 with forward positive; releases on pointer up, cancel, lost capture and blur. Ported from the site demo.
- `driveMessage(telemetry, holding)` in the domain: a plain sentence for each state and limit.
- `DriveScreen`: Connect (simulator), a refused-key message, the lane view of the simulator's world, the HUD (on board, brought back, battery, distance) and the message, the joystick, Disconnect. Leaving the tab releases and disconnects.
- Tab bar: Games, Drive, Settings.

## Acceptance

- [x] Component tests: connecting shows the HUD; a refused key shows why; holding the stick drives the simulator and letting go stops it; the lane limit message appears at the edge.
- [x] Playwright: open Drive, connect, drive, see the robot move and stop.

## Comments

Done. `Joystick`, `LaneView`, `DriveScreen`, `domain/drive.ts` (`driveMessage`, `refusalMessage`). Tabs are now Games, Drive, Settings. `DriveScreen` takes `createTarget` and `issueKey`, so `BleRobot` and real hire keys can be plugged in without changing it. Playwright 'drives the simulated robot from the Drive tab' passes. Also fixed `.at()` in the ticket 04 test, which the ES2020 typecheck rejects.

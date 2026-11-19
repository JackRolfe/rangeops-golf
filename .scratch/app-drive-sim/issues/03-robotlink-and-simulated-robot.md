# 03. RobotLink and SimulatedRobot

Status: resolved
Spec: ../spec.md
Blocked by: 01, 02

## What

- `apps/player/src/robot/RobotLink.ts`: `RobotLink` (`connect(hireKey)`, `sendDrive`, `onTelemetry`, `disconnect`, `connected`), `RobotInfo`, `HireKeyRefused`.
- `apps/player/src/robot/SimulatedRobot.ts`: implements `RobotLink`. Bytes in and out go through the codec. Telemetry 5 times a second. Locked (state 7) until Unlock gets a valid key and again on disconnect or when the hire ends. Sequence filter. Brake on release. Link lost after 300 ms of silence while the thumb was down. Ramp and speed cap with the speed flag. Lane limit with far, left and right flags and state 2. Pickup of up to ten balls at the mouth; unload at the bay. Battery drain and low-battery state. Hooks for the stop switch and faults. Deterministic stepping (`advance(ms)`) for tests, a timer for the app. `world()` for the lane view.

## Acceptance

- [x] Tests: refuses each bad key and stays locked; drives only after unlock; stops on release; link lost after 300 ms; ignores a stale sequence number; holds the far end, left and right edges with the right flags; speed flag at full stick; picks up balls up to ten and unloads at the bay; telemetry five times a second.

## Comments

Done. `RobotLink.ts` and `SimulatedRobot.ts` (a `SimulatedFirmware` that only sees bytes, wrapped by the `SimulatedRobot` link). Robot terms by default; range terms as an option, as in the site demo. 20 tests in `SimulatedRobot.test.ts`.

Follow-up, 2026-11-19: the simulator now follows the R0 firmware's safety core (state order, skid-steer speed cap, release after the stop switch or a fault, latched low battery), reads Unlock back for the key result (firmware ADR 0005) and clears faults with Drive flag bit 1 (ADR 0003). See the spec's decisions table.

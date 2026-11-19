# 05. Safety core: rules, states, ramp and speed cap

Status: resolved
Type: task
Blocked by: 04
Spec: [spec.md](../spec.md#safety-rules-in-order)

## What

The `SafetyCore` in `lib/mulligan_core/`, called at 100 Hz with a snapshot of inputs (time in ms, stop switch, lock state, latest accepted Drive message and when it arrived, tilt, measured side speeds, commanded duties, battery volts, sensor health) and returning outputs (target side speeds, relay on/off, state, fault flags, limit flags, last sequence acted on, power-down request).

Rules in the documented order: stop switch, link timeout (300 ms), tilt (35°) or stall (0.5 s), low battery (16.5 V / 15 V, filtered, 2 s), lane limit (interface plus a stub that never limits), speed cap (1.11 m/s per side, scaled together). Then the ramp: 1 m/s² up, 2.5 m/s² down. Stick mapping in robot terms. Fault latch and clear with flag bit 1.

## Acceptance

- [x] A test per rule, including the order (stop switch wins over everything; fault wins over link timeout).
- [x] Stopping distance from 1.11 m/s on release is about 0.25 m, and on a lost link about 0.58 m, integrated in a test.
- [x] Stick must be released after the stop switch, a fault clear or an unlock before it moves again.
- [x] Locked: Drive ignored, state 7, zero output.

## Comments

Done in lib/mulligan_core/src/safety.{h,cpp} and battery.{h,cpp}, 24 tests in test/test_safety. Defaults picked along the way:

- **No release needed after an unlock.** The app sends nothing until the stick is held, so requiring a release would swallow the child's first press. Release is still needed after the stop switch and after a fault.
- **A lost link resumes.** When messages come back with the stick held, it drives again, on the ramp (DESIGN.md: LinkLost to Idle when messages resume).
- **Tilt needs 100 ms beyond 35°**, so a bump is not a fault. Sensors silent for 200 ms are a fault.
- **Stall:** a side at 0.25 duty or more turning slower than 0.05 m/s for 0.5 s. This also catches a dead encoder.
- **Low battery brakes on the ramp and latches** until restart; the voltage recovering with the motors off does not undo it. Under 15 V the relay opens and the core asks for a power-down.
- **Relay:** off while locked, for the stop switch, a fault or a power-down. After a lock it stays on until the robot has braked to a stop, so it brakes rather than coasts.
- **Speed cap:** full forward plus any turn sets the speed limit flag and telemetry state 2, because the cap is then overriding the stick.

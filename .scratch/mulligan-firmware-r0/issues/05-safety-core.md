# 05. Safety core: rules, states, ramp and speed cap

Status: ready-for-agent
Type: task
Blocked by: 04
Spec: [spec.md](../spec.md#safety-rules-in-order)

## What

The `SafetyCore` in `lib/mulligan_core/`, called at 100 Hz with a snapshot of inputs (time in ms, stop switch, lock state, latest accepted Drive message and when it arrived, tilt, measured side speeds, commanded duties, battery volts, sensor health) and returning outputs (target side speeds, relay on/off, state, fault flags, limit flags, last sequence acted on, power-down request).

Rules in the documented order: stop switch, link timeout (300 ms), tilt (35°) or stall (0.5 s), low battery (16.5 V / 15 V, filtered, 2 s), lane limit (interface plus a stub that never limits), speed cap (1.11 m/s per side, scaled together). Then the ramp: 1 m/s² up, 2.5 m/s² down. Stick mapping in robot terms. Fault latch and clear with flag bit 1.

## Acceptance

- [ ] A test per rule, including the order (stop switch wins over everything; fault wins over link timeout).
- [ ] Stopping distance from 1.11 m/s on release is about 0.25 m, and on a lost link about 0.58 m, integrated in a test.
- [ ] Stick must be released after the stop switch, a fault clear or an unlock before it moves again.
- [ ] Locked: Drive ignored, state 7, zero output.

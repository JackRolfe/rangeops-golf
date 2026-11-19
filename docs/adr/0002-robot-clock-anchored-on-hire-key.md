# 2. On R0 the robot's clock is anchored on the first hire key

Status: accepted for R0; the real time source is still open, 2026-11-19

## Context

A hire key is valid between a start and an end time, in Unix seconds. The robot checks it with no network, so it needs a clock it trusts ([robot/README.md](../../robot/README.md#control-link-draft)). The ESP32 has no battery-backed clock, and the phone's time can't be trusted, because the phone is what the check is protecting against. The plan lists this as open.

Options for later: a real-time clock module with a coin cell, set in the workshop; time signed by the backend and carried with the key; time from the dock.

## Decision

For R0, time sits behind a `Clock` interface (`bool now(uint32_t& unixSeconds)`, false while unknown), and the implementation is an **anchored clock**:

- Unknown at boot.
- The first key whose version, signature and serial all check out sets the clock to that key's start time; from then on the clock counts up from the ESP32's monotonic timer.
- Later keys are checked against that clock in the usual way.

## Consequences

- A hire lasts no longer than it says, measured from when it was first used.
- The robot cannot tell an old key from a new one after a restart, so a key can be replayed by restarting the robot. Acceptable for a private bench rover with no public use. Not acceptable for R3; settle the real time source before then.
- Swapping in a real clock means one new `Clock` implementation; the key check does not change.

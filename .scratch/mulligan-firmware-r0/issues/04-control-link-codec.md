# 04. Control link messages: Drive, Telemetry, Info

Status: resolved
Type: task
Blocked by: 01
Spec: [spec.md](../spec.md#drive-messages)

## What

Plain C++ in `lib/mulligan_core/`:

- Parse a Drive write: exactly 4 bytes, x and y in −100…100, flags (bit 0 thumb, bit 1 clear fault, ADR 0003).
- Sequence filter: first after a reset is accepted; then only newer by serial-number arithmetic.
- Encode the 8-byte Telemetry message.
- Build the Info text and the advertised name from the serial.
- UUIDs as constants.

## Acceptance

- [x] Tests for bad lengths, out-of-range sticks, wrap at 255, duplicates and late messages, telemetry byte layout (distance low byte first).

## Comments

Done in lib/mulligan_core/src/link.{h,cpp}, tests in test/test_link. A message exactly 128 ahead counts as old.

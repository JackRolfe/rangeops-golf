# 01. Control link codec

Status: ready-for-agent
Spec: ../spec.md
Blocked by: none

## What

`apps/player/src/robot/protocol.ts`: the service and characteristic UUIDs; `encodeDrive`/`decodeDrive` (4 bytes: sequence, signed x, signed y, flags with bit 0 thumb); `encodeTelemetry`/`decodeTelemetry` (8 bytes: state, battery, balls or 255, fault flags, distance in decimetres little-endian or 65535, limit flags, last sequence); `RobotState`, fault and limit flags; `encodeHireKey`/`decodeHireKey` (78 bytes: version, 4 serial characters, start and end as little-endian u32 Unix seconds, bay, 64-byte signature) and `hireKeyBody`; `isNewerSequence` (ahead by 1 to 127, wrapping at 255); `parseInfo` for "Mulligan-A1B2;0.1.0;R0".

## Acceptance

- [ ] Round-trip tests for every message; exact byte layouts checked; out-of-range stick values and wrong lengths rejected; times past 2^31 survive.

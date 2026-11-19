# 01. PlatformIO project with native tests and the ESP32-S3 build

Status: ready-for-agent
Type: task
Blocked by: none
Spec: [spec.md](../spec.md)

## What

Create `robot/firmware/` as a PlatformIO project with two environments:

- `esp32s3`: `espressif32` (pinned), board `esp32-s3-devkitc-1`, Arduino framework. A `main.cpp` that boots and blinks the status light on 38.
- `native`: Unity tests on the host, building the libraries in `lib/` only.

Vendor Monocypher 4 (with its optional Ed25519 file) in `lib/monocypher/` with its licence. One smoke test that checks an RFC 8032 Ed25519 vector with Monocypher.

## Acceptance

- [ ] `pio test -e native` runs and passes the smoke test.
- [ ] `pio run -e esp32s3` compiles.
- [ ] Build output is git-ignored.

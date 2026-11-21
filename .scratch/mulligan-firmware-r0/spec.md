# Spec: Mulligan R0 firmware and hire-key tooling

Status: resolved

## Problem

Mulligan has a design, a parts list and a draft control link, but no firmware. The R0 bench rover needs firmware that lets a phone holding a valid hire key drive it over Bluetooth LE, with every safety promise enforced on the robot itself, so that it holds even when the app misbehaves or disappears. Hire keys are signed by the booking backend later; for now the builder needs a way to make a signing key and issue keys by hand on the bench.

Nobody can flash a board yet, so everything that decides behaviour must be provable on a laptop.

## Sources

- [robot/README.md](../../robot/README.md): control link (service, characteristics, Drive, Telemetry, Info, Unlock, the 78-byte hire key), safety promises, stage R0.
- [robot/DESIGN.md](../../robot/DESIGN.md): firmware loop and rule order, numbers (1.11 m/s, 85°/s, 1 m/s² up, 2.5 m/s² down, 35° tilt, 0.5 s stall, 16.5 V / 15 V), pin table, relay and stop switch.
- [robot/BUILD.md](../../robot/BUILD.md): wiring (MDD10A on 4–7, encoders on 15–18, I²C on 8/9, relay on 42), right motors reversed in firmware.

## Solution

A PlatformIO project in `robot/firmware/` with two environments:

- `esp32s3`: the real firmware for the ESP32-S3-DevKitC-1, Arduino framework.
- `native`: host build that runs the Unity tests of everything that makes a decision.

The code splits into a **core** of plain C++ with no hardware calls, and a thin **board layer** that reads pins and sensors, feeds the core, and writes its outputs to the motor driver, relay and BLE stack.

A Node script, `robot/tools/hire-key.mjs`, with no dependencies, makes signing keys, signs and checks hire keys, and writes the shared test vectors that the firmware tests check against.

## Behaviour

### Hire keys and locking

- At boot and after every disconnect the robot is **locked**: telemetry state 7, Drive messages ignored, motors stopped.
- Writing a valid 78-byte key to Unlock unlocks it for that connection. Valid means: length 78, version 1, the signature checks against the public key built into the firmware, the serial is the robot's own, and the robot's time is inside `[start, end)`.
- A write that fails any check leaves the robot locked (or locks it). The write itself succeeds; the app reads Unlock back for one byte saying why ([ADR 0005](../../docs/adr/0005-unlock-result-read-back.md)), and telemetry stays at state 7.
- When the hire ends while driving, the robot brakes and locks.
- **Clock (open).** The robot has no trusted clock. Time comes through a `Clock` interface. The R0 implementation is an *anchored clock*: unknown at boot; the first key whose signature and serial check out anchors it at that key's start time, and it counts up from the ESP32's monotonic timer. This enforces the hire's length but not its calendar time, and an old key can be replayed after a reboot. Acceptable for a private bench rover; the real time source is an open decision ([ADR 0002](../../docs/adr/0002-robot-clock-anchored-on-hire-key.md)).

### Drive messages

- Accepted only while unlocked, only if exactly 4 bytes with x and y in −100…100.
- The first message after unlocking is accepted whatever its sequence number. After that a message is accepted only if it is newer: `(int8)(seq − last) > 0`. Late, duplicate and out-of-order messages are ignored and do not refresh the link timer.
- Thumb flag clear means stop, whatever x and y say.
- Stick to motion, in robot terms: forward speed `v = y/100 × 1.11 m/s`, turn rate `ω = x/100 × 85°/s`, right positive. Side speeds `v ± ω × track/2` (left gets `+`), track 0.37 m.

### Safety rules, in order

Every control tick (100 Hz) the core runs, in order, and any rule can force a stop:

1. **Stop switch** (pin 2). Pressed → relay open, outputs zero at once, state 4. Released → back to idle; the stick must be released and pressed again before it moves.
2. **Link timeout.** Unlocked, stick last held, and no valid Drive message for 300 ms → brake to zero, state 3. Messages resuming → normal.
3. **Tilt or stall.** Tilt beyond 35° from upright, or a side commanded above a threshold whose wheel has not turned for 0.5 s → relay open, outputs zero, state 5 with fault flags. A sensor that stops answering → fault, sensor bit. Faults latch until cleared (see below) and the cause is gone.
4. **Low battery.** Battery filtered below 16.5 V for 2 s → stop driving, state 6, low-voltage bit. Below 15 V for 2 s → also open the relay and power down (deep sleep).
5. **Lane limit.** An interface with a stub for R0 that never limits. The stub is where R2's box goes.
6. **Speed cap.** Each side's target is held to 1.11 m/s; if a side would exceed it, both sides scale together so the turn keeps its shape, and the speed limit flag (bit 3) is set.

After the rules: **acceleration ramp** on each side, 1 m/s² speeding up and 2.5 m/s² slowing down or reversing, then a per-side speed controller (feed-forward plus PI against the encoder) produces a duty of −1…1 for the MDD10A.

### Clearing a fault

The control link has no way to clear a fault. Proposed change, recorded in [ADR 0003](../../docs/adr/0003-drive-flag-to-clear-a-fault.md) and not yet in `robot/README.md`: **Drive flags bit 1, "clear fault"**. A fault clears on a Drive message with bit 1 set and bit 0 clear, once its cause is gone. A power cycle also clears it.

### Telemetry, 5 Hz

Notified as the 8 bytes in the control link. State priority when several apply: stop switch 4, fault 5, low battery 6, locked 7, link lost 3, at a limit 2, driving 1, idle 0. Balls on board 255 (not counted on R0). Distance from where it was zeroed (boot) from odometry, in decimetres, 65535 if unknown. Byte 7 is the last Drive sequence acted on.

### BLE

- Advertises as `Mulligan-XXXX`, the serial being the last two bytes of the Bluetooth MAC in upper-case hex.
- One connection at a time: advertising stops while connected and restarts on disconnect.
- Info: `Mulligan-XXXX;<firmware version>;R0`.
- Unlock accepts the 78-byte write (the app raises the MTU first; long writes also work).

### Hardware layer

- MDD10A: PWM 20 kHz on 4 (left) and 6 (right), direction on 5 and 7. Right side reversed in firmware.
- Encoders: quadrature, both edges of A and B, on 15/16 (left) and 17/18 (right). goBILDA 5203 at 26.9:1 gives about 751.8 counts per wheel turn; wheel 144 mm.
- Relay on 42, high to close (motor power on). Low at boot.
- Stop switch on 2 with the pull-up: low means released, high means pressed or a broken wire. The wiring for pin 2 is not in BUILD.md yet (see ticket 07).
- BNO085 and INA228 on I²C, 8 (SDA) and 9 (SCL).
- Status light on 38: off locked, slow blink unlocked, on driving, fast blink fault.

### Hire-key tool

`node robot/tools/hire-key.mjs <command>`:

- `keygen`: a new Ed25519 key pair. Private key to `robot/tools/.keys/hire-signing-key.pem` (git-ignored, mode 600, never overwritten without `--force`); public key printed and written into the firmware header.
- `sign --serial ABCD --bay 3 [--start now|ISO|unix] [--end +1h|ISO|unix]`: prints the key as hex and base64url.
- `verify <hex> [--pub <hex>]`: decodes and checks a key.
- `vectors`: rewrites the shared test vectors from the fixed test seed.

## Testing

- Unity on `native` for: Drive parsing and sequence rules, telemetry encoding, hire-key decoding and checking (against the shared vectors), the anchored clock, the safety core rule by rule, ramp, speed cap, PI controller, stall and tilt detection, battery filter, quadrature decoding, odometry.
- `robot/firmware/test/vectors/hire_keys.json` is written by the tool. The native build turns it into a header, so the firmware tests check exactly what the signer produced. A Node test checks the signer still produces the file byte for byte.
- `pio run -e esp32s3` compiles. Nothing is flashed.

## Out of scope

- The app (another session builds the Drive screen against the same link).
- Lane limit beyond the stub, range-terms steering, ball counting, Wi-Fi updates, the dock.
- A trusted clock (open), key revocation, replay protection across reboots.

## Done when

- `pio test -e native` passes, including the vector tests.
- `pio run -e esp32s3` compiles.
- `node --test robot/tools` passes.
- Each ticket is a local commit on `feature/robot-firmware-r0-c75956`.

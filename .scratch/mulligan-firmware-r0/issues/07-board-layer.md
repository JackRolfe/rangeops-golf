# 07. Board layer: BLE, motors, encoders, sensors, telemetry

Status: resolved
Type: task
Blocked by: 03, 04, 05, 06
Spec: [spec.md](../spec.md#ble)

## What

`src/` for the ESP32-S3, making no decisions of its own:

- BLE service and four characteristics with the documented UUIDs and properties; one connection at a time; MTU raised; lock on disconnect.
- MDD10A on 4/5 and 6/7 at 20 kHz, right side reversed. Relay on 42, low at boot. Stop switch on 2 with the pull-up.
- Encoder interrupts on 15–18 feeding the decoder.
- BNO085 (gravity and game rotation vector) and INA228 (bus voltage) on I²C 8/9.
- 100 Hz loop feeding the safety core and the speed controllers; telemetry notify at 5 Hz; status light on 38; deep sleep on power-down.
- `robot/firmware/README.md`: how to build, test, sign a bench key, what is untested.

## Open on the bench

- **Pin 2 wiring is not in BUILD.md.** The stop button breaks the relay coil's supply, but nothing in the wiring reports its state to pin 2. The firmware assumes a second contact (or a divider from the coil side) that pulls pin 2 low while the button is released; high, including a broken wire, reads as pressed. Needs a BUILD.md step once the button's contacts are known. `ready-for-human`.
- Relay board trigger jumper set to high trigger.
- Encoder direction and right-motor reversal to be checked with the wheels off the ground.

## Acceptance

- [x] `pio run -e esp32s3` compiles with no warnings from our code beyond the bench-key warning.
- [x] README written.

## Comments

Done in src/main.cpp and src/board.h; README in robot/firmware/README.md. Compiles with -Wall -Wextra on src and only the deliberate bench-key warning. Choices:

- Bluetooth callbacks only copy bytes under a spinlock; the hire lock and safety core run on the loop task alone.
- The Arduino BLE library answers a write before the firmware sees it, so a bad key can't be refused with an ATT error. Unlock is readable instead and gives the last check result (ADR 0005); the spec is updated.
- Encoders use pin-change interrupts reading GPIO_IN_REG directly, with the step table in RAM. PCNT would also work if interrupts prove too busy.
- The INA228 is read at 10 Hz; a reading outside 5–30 V counts as no reading. The BNO085 gives gravity (tilt) and the game rotation vector (heading) at 100 Hz.
- Power-down waits 3 s so telemetry can say why, then deep-sleeps with no wake source.

The pin 2 wiring gap moved to ticket 08. The control-link changes from ADR 0003 and 0005 are ticket 09.

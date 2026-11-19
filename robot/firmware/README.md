# Mulligan firmware, R0

Firmware for the R0 bench rover: an ESP32-S3-DevKitC-1 driving a Cytron MDD10A, with goBILDA encoders, a BNO085 motion sensor and an INA228 battery monitor. It speaks the [control link](../README.md#control-link-draft) over Bluetooth LE and only drives for a phone that has written a valid [hire key](../README.md#control-link-draft).

Nothing here has run on a board yet. The decisions are tested on a laptop; the hardware layer only compiles.

## Layout

| Path | What |
| --- | --- |
| `lib/mulligan_core/` | Every decision, in plain C++ with no hardware calls ([ADR 0001](../../docs/adr/0001-firmware-safety-core-tested-on-host.md)). |
| `lib/mulligan_core/src/link.*` | Drive, Telemetry and Info messages; the sequence rule. |
| `lib/mulligan_core/src/hire_key.*`, `clock.*` | Checking hire keys; the anchored clock ([ADR 0002](../../docs/adr/0002-robot-clock-anchored-on-hire-key.md)). |
| `lib/mulligan_core/src/safety.*`, `battery.*` | The safety core: rules, states, ramp, speed cap. |
| `lib/mulligan_core/src/motion.*` | Encoder decoding, wheel speed, speed controller, odometry, tilt. |
| `lib/monocypher/` | Monocypher 4.0.2 for Ed25519, vendored unchanged. |
| `src/` | The board layer: pins, interrupts, sensors, Bluetooth, the 100 Hz loop. |
| `include/hire_public_key.h` | The public key the robot trusts. Written by `robot/tools/hire-key.mjs`. |
| `test/` | Unity tests for the native build. `test/vectors/hire_keys.json` is shared with the signer. |

## Build and test

Install PlatformIO once, with `uv` (or `pipx`):

```bash
uv tool install platformio
```

From this folder:

```bash
pio test -e native
```

```bash
pio run -e esp32s3
```

And the signer's own tests, from the repository root:

```bash
node --test robot/tools/*.test.mjs
```

The first ESP32 build downloads the toolchain, a few hundred megabytes. The build prints one warning on purpose while the firmware trusts the bench test key.

## Hire keys on the bench

Until you make a signing key, the firmware trusts the public **test** key, whose private half is in the test vectors, so anyone with this repository can sign keys for it ([ADR 0004](../../docs/adr/0004-bench-firmware-trusts-the-test-key.md)). Fine on your own bench; make a real key before the robot is anywhere other phones can reach.

From the repository root, sign a one-hour key for the robot advertising as `Mulligan-A1B2`, bay 1, with the test key:

```bash
node robot/tools/hire-key.mjs sign --serial A1B2 --bay 1 --test-key
```

It prints the key as hex and base64url. Write the 78 bytes to the Unlock characteristic.

From the repository root, make a real signing key (the private key stays in `robot/tools/.keys/`, which git ignores), then rebuild and flash:

```bash
node robot/tools/hire-key.mjs keygen
```

After that, `sign` without `--test-key` uses it. Back up `robot/tools/.keys/`: lose it and you need a new pair and a reflash. `node robot/tools/hire-key.mjs bench-key` puts the test key back.

The robot has no trusted clock: the first good key after a restart sets its time to that key's start. A hire lasts as long as it says from then on, but an old key works again after a restart. Settle the clock before anyone else uses the robot.

## How it behaves

- Locked (telemetry state 7) at power-on and after a disconnect, until a valid key is written to Unlock. A disconnect forgets the key, so every connection writes its own. Read Unlock back for one byte saying why a key was refused ([ADR 0005](../../docs/adr/0005-unlock-result-read-back.md)); it reads 1 again after a disconnect.
- After connecting, the robot asks the phone for a 15–30 ms connection interval with no latency and a 6 s supervision timeout. The phone may say no; the 300 ms Drive timeout is what stops the robot either way.
- Stick in robot terms: up is forward at up to 1.11 m/s, sideways is a turn at up to 85°/s. Speeds up at 1 m/s², brakes at 2.5 m/s².
- Stops for: the stop switch (motor power cut at once), no Drive message for 300 ms while the stick was held, tilt beyond 35°, a wheel that is driven but not turning for half a second, a sensor that stops answering, the battery below 16.5 V (and powers down below 15 V), and the end of the hire.
- A fault (tilt, stall, sensor) stays until the app sends a Drive message with flag bit 1 set and the thumb flag clear, once the cause is gone, or until a restart ([ADR 0003](../../docs/adr/0003-drive-flag-to-clear-a-fault.md)). After the stop switch or a fault, the stick must be released before the robot moves again.
- Status light: off while locked, slow blink when ready, on while driving, fast blink when stopped by the switch, a fault or the battery.

## Check on the bench before driving

With the wheels off the ground and the battery in:

1. **Relay polarity.** The relay should click on only once a key is written. If it is on at power-up, the board's trigger jumper is set to low; move it to high.
2. **Stop switch on pin 2.** [BUILD.md](../BUILD.md#wiring) does not wire it yet. The firmware expects pin 2 pulled to ground while the button is released, through a second contact on the button, and reads open (pressed, or a broken wire) as stop. Until that is wired, the robot always reports state 4.
3. **Sensors.** Without the BNO085 or the INA228 answering, it reports a sensor fault and will not drive. That is deliberate.
4. **Directions.** Push the stick forward gently: both sides should turn forward, and telemetry distance should rise. If a side runs backwards or its distance falls, flip its sign in `src/board.h` (`kLeftSign`, `kRightSign`).
5. **A long Unlock write.** Connect from something that keeps the MTU at 23 bytes, such as nRF Connect with its MTU left at 23, so the 78-byte key has to go as a long write (Prepare and Execute Write), as it can from an iPhone. Write a key, read Unlock back and expect `00`. Then check the robot asks for the shorter connection interval: nRF Connect's log shows the connection parameters update to 15–30 ms.
6. **Speed controller.** The gains in `lib/mulligan_core/src/motion.h` are first guesses. Expect to tune them on grass.

What the host tests cannot cover: pin polarity, interrupt timing, the Bluetooth stack, the sensors' mounting and orientation (gravity is taken as +z when level) and the stopping distances on real grass.

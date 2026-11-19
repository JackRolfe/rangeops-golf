# RangeOps context

The words this repository uses, and what they mean. Decisions are in [docs/adr/](docs/adr/).

## The robot

- **Mulligan.** The robot, and only the robot. RangeOps is the offering and the app.
- **Control link.** The Bluetooth LE service the app and the robot share: Drive, Telemetry, Info and Unlock. Defined in [robot/README.md](robot/README.md#control-link-draft).
- **Hire key.** 78 bytes, signed with Ed25519 by the service's signing key, naming one robot (by its four serial characters), a bay and a time window. Written to Unlock. Only a phone that has written a valid hire key may drive.
- **Signing key.** The Ed25519 private key that signs hire keys. The robot carries only its public half. The bench signing key lives in `robot/tools/.keys/` and is never committed.
- **Locked.** The robot holds no valid hire key for the current connection: telemetry state 7, Drive ignored. It is locked at boot, after a disconnect and when the hire ends.
- **Serial.** Four upper-case characters that name a robot, as in its advertised name `Mulligan-XXXX`.
- **Robot clock.** Where the robot gets the time that a hire key's window is checked against. On R0 it is the *anchored clock* ([ADR 0002](docs/adr/0002-robot-clock-anchored-on-hire-key.md)).
- **Safety core.** The firmware's plain C++ that turns inputs (the latest Drive message, the stop switch, sensors, the time) into outputs (side speeds, relay, telemetry). It makes every decision and touches no hardware, so it is tested on a laptop.
- **Board layer.** The firmware that reads pins and sensors, feeds the safety core and writes its outputs. It makes no decisions of its own.
- **Fault.** A latched stop for a stall, a tilt or a sensor that stopped answering. It stays until the cause is gone and the app clears it ([ADR 0003](docs/adr/0003-drive-flag-to-clear-a-fault.md)) or the robot restarts.
- **Robot terms.** Stick up is forward and sideways is turn, whatever way the robot faces. R0 steers this way. *Range terms*, where up is up the range, come once heading is trustworthy.

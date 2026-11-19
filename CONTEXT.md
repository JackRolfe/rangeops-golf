# RangeOps context

The words this repository uses, and what they mean. Code, specs and tickets use these terms; add to this as terms settle. Decisions are in [docs/adr/](docs/adr/).

## Ranges and bays

- **Range.** One driving range. Has a time zone and a currency, and everything below belongs to one.
- **Bay.** One hitting position at a range, numbered 1 to 255 (the number goes into a hire key's single byte).
- **Bay-hour.** The unit a bay is booked and priced in. Bookings start on the hour.
- **Peak / off-peak.** The two prices of a bay-hour. An hour is peak if it starts inside one of the range's **peak windows** (weekday and local times).
- **Check-in code.** The secret in the QR code at a bay. Scanning it while holding a booking for that bay checks the booking in.

## Accounts and money

- **Account.** One person, identified by email, signed in by **sign-in link**. One account works at every range.
- **Range staff.** An account allowed to use a range's console endpoints.
- **Booking.** A bay for one or more bay-hours, with optional **add-ons**: `robot`, `club_hire`, `lesson`. Its **source** is `rangeops` (taken in the app) or `external` (taken by another system and handed in).
- **Order.** What an account paid for: a booking, a bucket, a pass or ball credit. Money is integer cents.
- **Bucket.** A fixed number of balls, sold as a **bucket code** (`XXXX-XXXX`) that staff or a ball machine **redeem**. Where it was paid for doesn't matter to redemption.
- **Pass.** A monthly membership at one range, giving a percent off bays and buckets while valid.
- **Ball credit.** Prepaid balls held on an account at one range, spent on buckets.
- **Payment provider.** Whatever takes the money. Today only the fake provider exists.

## The robot and its hire

- **Mulligan.** The robot, and only the robot. RangeOps is the offering and the app. In the backend it is a **robot** record: serial, home bay, last reported status.
- **Serial.** Four upper-case characters that name a robot, as in its advertised name `Mulligan-XXXX`.
- **Hire.** A robot assigned to a booking's bay for the booking's hours.
- **Hire key.** 78 bytes, signed with Ed25519 by the signing key, naming one robot (by its serial), a bay and a time window. It lets one phone drive one robot during one hire. It reaches the phone in a **hire link** and is written to Unlock. Layout in [robot/README.md](robot/README.md#control-link-draft).
- **Signing key.** The Ed25519 private key that signs hire keys. The robot carries only its public half. The bench signing key lives in `robot/tools/.keys/`, the backend's in a gitignored file, and neither is ever committed.
- **Fleet.** A range's robots with their latest status and hires, as the console sees them.
- **Control link.** The Bluetooth LE service the app and the robot share: Drive, Telemetry, Info and Unlock. Defined in [robot/README.md](robot/README.md#control-link-draft).
- **Locked.** The robot holds no valid hire key for the current connection: telemetry state 7, Drive ignored. It is locked at boot, after a disconnect and when the hire ends.
- **Robot clock.** Where the robot gets the time that a hire key's window is checked against. On R0 it is the *anchored clock* ([ADR 0002](docs/adr/0002-robot-clock-anchored-on-hire-key.md)).
- **Safety core.** The firmware's plain C++ that turns inputs (the latest Drive message, the stop switch, sensors, the time) into outputs (side speeds, relay, telemetry). It makes every decision and touches no hardware, so it is tested on a laptop.
- **Board layer.** The firmware that reads pins and sensors, feeds the safety core and writes its outputs. It makes no decisions of its own.
- **Fault.** A latched stop for a stall, a tilt or a sensor that stopped answering. It stays until the cause is gone and the app clears it ([ADR 0003](docs/adr/0003-drive-flag-to-clear-a-fault.md)) or the robot restarts.
- **Robot terms.** Stick up is forward and sideways is turn, whatever way the robot faces. R0 steers this way. *Range terms*, where up is up the range, come once heading is trustworthy.

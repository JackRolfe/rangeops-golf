# Mulligan, the RangeOps robot

Mulligan is a knee-high remote-control buggy that lives at a driving range bay. A child drives it out from the RangeOps app, rolls it over the short shots to scoop them up, and drives them back to hit again.

Nothing here is built yet. This is the plan for building it, and [DESIGN.md](DESIGN.md) is the design: dimensions, drawings, parts and the reasons behind them. Firmware, CAD and test notes will live in this folder as they appear. How the robot fits with the app and the rest of the offering is in [docs/PLAN.md](../docs/PLAN.md).

## Target spec

These are the numbers on the site. They are targets to design towards, not measurements.

| | Target | Note |
| --- | --- | --- |
| Carries | 10 balls a trip | About 0.46 kg of balls, so load is not what sizes the motors. |
| Reach | 30 m from the bay | Sets the radio range and the lane-limit problem. |
| Top speed | 4 km/h | 1.1 m/s, a walking pace. Capped in firmware. |
| Height | 22 cm to the shell | Low enough for most shots to pass over. |
| Runtime | 3 hours a charge | Three one-hour hires between charges. |
| Control | Bluetooth, from a phone or iPad | No internet needed to drive. |

## What the safety promises require

The site makes four promises to parents and range owners. Each one is an engineering requirement, and each must hold with the app misbehaving or absent, so all four live in the robot.

| Promise | What the robot has to do |
| --- | --- |
| **Hold to drive.** It moves only while a thumb is on the stick, and stops if the signal drops. | The app sends drive messages continuously while the stick is held, and an explicit zero when it is released. Firmware also stops the motors when no valid message has arrived for 300 ms. From top speed the robot stops in about 25 cm on release and about 60 cm on a lost signal. |
| **Stays in its lane.** It keeps within 30 m and in front of its own bay. | The robot estimates its own position relative to the dock and refuses to drive further out of bounds. This is the hardest requirement here; see [Knowing where it is](#knowing-where-it-is). |
| **Takes a direct hit.** A stray ball does not break it. | A low shell that is shallow at both ends, so a ball glances off and carries on up the range instead of coming back toward the bays, with the battery and electronics behind it. Proven by hitting balls at it. |
| **Nothing spins.** No rollers or blades for small hands. | A passive pickup: balls push past light hanging flaps into a pen and cannot roll back out. The only moving parts a child can reach are the wheels, at walking pace, driven by motors too small to push hard. |

Two more that the site does not mention but a range will ask about: a physical stop switch on the robot that anyone can hit, and a flag tall enough to be seen from every bay.

## Subsystems

**Pickup.** A bottomless pen at the front with a gate of light flaps hanging from a rod. Driving over a ball lifts the flaps; they fall back behind it and a stop rod keeps them from swinging out. The flaps have to be nearly weightless, because grass is all that holds a ball still while the gate passes over it. Unloading is by hand at the mat. This is the part with no off-the-shelf answer and the one to prototype first, by hand, with no electronics: flap weight and spacing; whether it works on wet grass, in a divot and at the edge of a mat; whether ten balls stay in on the drive home.

**Chassis and drive.** Four wheels, driven as left and right sides and steered by running the sides at different speeds, as in the drawing on the site. Wheels of 12 to 15 cm for range grass. A 15 cm wheel turning at about 140 rpm gives the 4 km/h top speed, so look for geared motors around that output speed with encoders. Start R0 on a bought four-wheel chassis rather than designing one.

**Electronics.**

- Controller: an ESP32-S3 module. It has Bluetooth LE for driving and Wi-Fi for updating firmware in the workshop, and it comes as a pre-certified radio module.
- A motor driver sized for the motors' stall current, not their running current.
- Wheel encoders and a six-axis motion sensor, for speed control, distance travelled, heading and detecting a flip or a stall.
- A stop switch, a power switch and a status light.
- Optional: a light-beam sensor across the corral gate to count balls in. The app's display of balls on board depends on it.

**Power.** Use an 18 V power-tool battery for R0 to R2, feeding the motors through a 12 V regulator. A charger already exists and the pack swaps in seconds. Do not count on the pack to protect itself from being run flat; the firmware cuts off first. Measure the real power draw on grass with R0 before choosing a capacity: three hours is the target, and it cannot be estimated well from a bench.

**Dock.** A parking spot at the bay that gives the robot a known starting position and heading. Batteries are swapped by staff and charged on their own charger; charging on the dock waits for a purpose-made battery. Not needed until R2.

**Firmware.** One loop: read the drive message, apply the safety rules, run the motors, report telemetry. The safety rules run in this order and any one of them can force a stop: stop switch, signal timeout, tilt or stall, lane limit, speed cap.

## Knowing where it is

Holding the lane is the hard problem. A bay is about three metres wide and the robot works up to 30 m out, so being three degrees wrong about its heading puts it a metre and a half to one side, in front of the next bay.

The options, cheapest first:

| Approach | How | Weakness |
| --- | --- | --- |
| Odometry and gyro | Count wheel turns and integrate heading from the dock. | Drifts with wheel slip on grass and with time. Probably too loose for a single-bay lane at 30 m. |
| Signal strength | Estimate distance from the Bluetooth signal. | Distance only, and rough. Useful as a backstop for the 30 m limit, not for the lane. |
| Ultra-wideband ranging | A radio beacon on the dock; the robot measures its distance to it within tens of centimetres. Two beacons give a position. | More hardware on both robot and dock. |
| Satellite positioning with correction | Centimetre-level outdoors. | Costly, needs a base station, and fails under a bay roof. |

Plan: build R0 with odometry and a gyro and measure the drift over a 30 m out-and-back run on grass. If it holds a bay width, good. Assume it will not, and design R2 around ultra-wideband with odometry filling the gaps. For a pilot, reduce the stakes by using end bays or leaving a bay empty on either side.

## Control link (draft)

The app and the firmware both build against this, which is what lets them be built at the same time. It is a draft: change it freely until R0 drives, then version it.

One Bluetooth LE service with three characteristics. The robot advertises as `Mulligan-` followed by four characters of its serial.

| | UUID |
| --- | --- |
| Service | `618deb21-0248-48ee-8de9-e8d739eba464` |
| Drive | `618deb22-0248-48ee-8de9-e8d739eba464` |
| Telemetry | `618deb23-0248-48ee-8de9-e8d739eba464` |
| Info | `618deb24-0248-48ee-8de9-e8d739eba464` |

| Characteristic | Direction | Rate | Contents |
| --- | --- | --- | --- |
| Drive | app to robot, write without response | 20 times a second while the stick is held | 4 bytes, below |
| Telemetry | robot to app, notify | 5 times a second | 8 bytes, below |
| Info | read | once on connect | Text: robot name, firmware version and hardware revision, separated by semicolons |

Drive, 4 bytes:

| Byte | Meaning |
| --- | --- |
| 0 | Sequence number, counting up and wrapping at 255 |
| 1 | Stick x, signed, -100 to 100, right is positive |
| 2 | Stick y, signed, -100 to 100, forward is positive |
| 3 | Flags. Bit 0: a thumb is on the stick |

Telemetry, 8 bytes:

| Byte | Meaning |
| --- | --- |
| 0 | State: 0 idle, 1 driving, 2 at a limit, 3 link lost, 4 stopped by the switch, 5 fault, 6 low battery |
| 1 | Battery, percent |
| 2 | Balls on board; 255 if the robot does not count them |
| 3 | Fault flags. Bit 0 stall, bit 1 tilt, bit 2 sensor, bit 3 low voltage |
| 4, 5 | Distance from where it was zeroed, in decimetres, low byte first; 65535 if unknown |
| 6 | Limit flags, set while a limit is overriding the stick. Bit 0 far end, bit 1 left edge, bit 2 right edge, bit 3 speed |
| 7 | The sequence number of the last Drive message it acted on |

Rules:

- When the stick is released the app sends three Drive messages with x and y at zero and the flag clear, then stops sending. The robot brakes on the first.
- The robot also stops if 300 ms pass without a valid Drive message. That covers a lost signal or a crashed app; it is the backstop, not the normal way to stop.
- The sequence number lets firmware ignore a message that arrives late or out of order.
- Speed cap, acceleration ramp and lane limit are applied by the robot to whatever the stick asks for. When a limit is overriding the stick, telemetry says so, so the app can explain it.
- One controller at a time. Until the backend exists, any phone nearby can connect. With booking, the robot accepts only a phone holding the key for the current hire.

One open question to settle on R0: what the stick means. The site demo steers in range terms, where pushing the stick up the screen sends the robot up the range whichever way it is facing. That is easiest for a child but needs the robot to know its heading. The simple alternative is robot terms, where up is forward and sideways is turn. Start R0 in robot terms, and switch to range terms once heading is trustworthy.

## Build stages

Each stage ends with a test on grass. The thresholds are proposals to argue with.

**R0. Bench rover.** A bought chassis, the controller, motor driver, encoders, motion sensor and a tool battery. No pickup, no shell.

- Drives from a phone, held to the speed cap.
- Stops within 30 cm of the stick being released, and within 60 cm when the phone is switched off or walks out of range.
- Power draw measured over an hour of stop-start driving on grass, giving a real runtime figure.
- Odometry drift measured over ten 30 m out-and-back runs.

**R1. Pickup.** The corral that worked by hand, mounted on the rover.

- Collects ten scattered balls and brings them home, nine runs in ten.
- Loses none on the drive back, over bumps and through a turn.
- A child can unload it at the mat without help.

**R2. Lane limit and dock.** Position sensing, the dock and a first chassis of our own.

- Holds its lane within a bay width at 30 m, twenty runs in a row, and stops at the limit however the stick is held.
- Parks on the dock and re-zeros its position there.
- Runs three one-hour sessions on a charge.

**R3. Pilot build.** The shell, flag and weather sealing, and a handful of units.

- Survives repeated direct strikes from a full shot, with the battery and electronics unharmed and no ball coming back toward the bays.
- Works in rain and on wet grass.
- A week at a range with real families and no engineer standing next to it.

## Open questions

- Flap weight and gate geometry for the pickup. Only the hand prototype answers this.
- Final wheel size and whether all four wheels need driving, after R0 has been on grass.
- Whether to count balls on board or drop that from the app.
- How the robot gets to and from storage at opening and closing, and who charges it.
- What radio and electrical compliance marks are needed in the launch country, and what a range's insurer wants to see.

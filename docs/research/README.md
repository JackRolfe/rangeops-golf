# Research

Reading done for the open decisions in [docs/PLAN.md](../PLAN.md#decisions), researched on 2026-11-19. Each file cites its sources and ends with a recommendation and its trade-offs. Nothing here changes the plan yet. These are proposals for whoever next edits it.

| File | Plan decision it would settle | Recommendation in one line |
| --- | --- | --- |
| [ble-iphone-to-robot.md](ble-iphone-to-robot.md) | 2. How an iPhone talks to the robot | Keep Capacitor. Use `@capacitor-community/bluetooth-le`, whose web build also covers Chrome. |
| [robot-clock.md](robot-clock.md) | The clock the hire key needs (robot README, "a clock it trusts") | Fit a DS3231 clock module (STEMMA QT), and add a signed "issued at" to a v2 hire key. |
| [ball-machine-interfaces.md](ball-machine-interfaces.md) | 5. How a paid bucket reaches the ball machine, and idea 11 | Staff hand-over for the pilot. Then the machine's own PIN system, then a 12 V relay box. |
| [positioning-lane-limit.md](positioning-lane-limit.md) | 3. Where the robot is, for the lane limit (stage R2) | Drop UWB, since a fixed outdoor beacon isn't licensed in Australia. Plan R2 around RTK GNSS. |
| [rangeops-name-check.md](rangeops-name-check.md) | 1. Is the name RangeOps free to use? | Clear to proceed in Australia, with caveats: the .com is taken, the mark is weak, and an app called RangeOps exists. |

## 1. Is RangeOps free? (decision 1)

[rangeops-name-check.md](rangeops-name-check.md)

**Trade marks.** IP Australia has no RANGEOPS or RANGE OPS mark in any class. The nearest live golf marks pair RANGE with another word (RANGE SERVANT, TOPTRACER RANGE, RANGE PRO), and none of them conflicts. The only exact match anywhere is a US mark, RANGE OPS, held by a firearms-training business in class 45.

**Mulligan.** No live MULLIGAN mark in Australia in classes 7, 9 or 28. In the US, class 28 is crowded with MULLIGAN golf goods.

**Domains.**
- Free: rangeops.com.au, rangeops.golf and rangeopsgolf.com.
- Held and parked by someone else: rangeops.com and rangeops.io.
- Expired and pending delete: rangeops.app.

**Business names and other users.** ABN Lookup shows no RangeOps business name. One live App Store app already uses the name: "RangeOps: Firearm Range Log".

**Trade-offs.** The name is fairly descriptive, so an examiner may object to it in classes 9 and 42. The App Store listing would need a longer name such as "RangeOps Golf". If the name is to be secured, the next paid steps would be:
- TM Headstart in classes 9, 41 and 42, at about A$330 a class;
- registering the .com.au and the .golf.

This was an informal search, not legal advice. ASIC Connect couldn't be searched from the browser, so the file gives manual steps for it.

## 2. iPhone to robot (decision 2)

[ble-iphone-to-robot.md](ble-iphone-to-robot.md)

**What to use.** The plan's Capacitor route holds. Use Capacitor 8 with `@capacitor-community/bluetooth-le` 8.x: it is MIT-licensed and still released, most recently on 2026-11-18. Its web build runs on Web Bluetooth, so one `BleRobot` serves both the Chrome bench and the iOS shell. React Native would mean rewriting the UI, and a SwiftUI app would mean writing the control link twice.

**The 78-byte Unlock write.** It needs no MTU negotiation. iOS can't request an MTU, but a write with response can be longer than one packet, using the Bluetooth spec's Prepare and Execute Write. NimBLE accepts that by default. The robot README's line about asking for a larger packet size should be corrected.

**Firmware changes.**
- Request a 15–30 ms connection interval with latency 0, within Apple's accessory guidelines.
- Keep the 300 ms watchdog as the real stop.
- Forget the unlock on disconnect.

**App changes.**
- Send Drive as "latest value wins".
- Declare no background mode.
- On resume, treat the stick as released, reconnect and write the key again.

**Trade-offs.**
- TestFlight needs the US$99-a-year Apple Developer Program and Xcode on a Mac; this Mac has only the Command Line Tools.
- A free Personal Team install, re-signed every 7 days, is enough for the R0 bench.

## 3. The robot's clock (hire-key expiry)

[robot-clock.md](robot-clock.md)

**The clock.** Fit an Adafruit DS3231 Precision RTC, STEMMA QT (ADA5188). It is A$25.85 at Core Electronics, in stock, and about A$30 with coin cells and a cable. It plugs in last on the existing I²C chain at 0x68, which clashes with nothing. It drifts about a minute a year and survives battery swaps.

**The key.** Add a signed "issued at" to the hire key, making a version 2 of 82 bytes. The robot then:
- moves its clock forward only, to the larger of a floor stored in flash and the key's issue time;
- corrects backwards only from Wi-Fi time at the workshop;
- accepts a key from 2 minutes before its start until its end.

**Rejected options.**
- The ESP32's own timer: lost at every power cycle.
- GPS: a slow fix, and none under a roof.
- A clock in the dock: it would need power and a signing key at a public bay.
- Counter-only keys: unused keys never expire.

**Trade-offs.**
- Adds a coin cell. Core ships CR1220s by road only, and Australia's button-battery safety rules may matter before a pilot with children. A supercapacitor clock (SparkFun RV-1805) avoids the cell.
- The key layout in `robot/README.md` and the backend's signer would both change to v2.

## 4. Ball machine interfaces (decision 5, idea 11)

[ball-machine-interfaces.md](ball-machine-interfaces.md)

Keep the staff hand-over for the pilot, as planned. Once a range commits, integrate in this order:

1. **The range's own PIN or QR system**, if it has one (Range Servant, eRange, Range Star, GolfNext). The app sells the bucket and shows the machine's PIN. No hardware and no warranty risk, but it depends on the vendor; with Range Servant that may run through Sweetspot, and there is no partnership.
2. **Idea 11, the payment box.** A QR reader and an ESP32 close a relay across the machine's pay input, for about 200 ms per bucket. At 12 V that is outside NSW's definition of electrical installation work, so no licensed electrician is needed. It must never touch mains, it should be fitted with the maker's consent, and a box supplied to a range brings RCM obligations. Its codes must be single-use, because each pulse is free balls.

**Fix a source.** The plan's Japan source (Impress Watch) is about PLATTO GOLF, not a retrofit. The file gives better sources.

**Ask the range first.** The file ends with a checklist of questions for the pilot range about its machine.

## 5. Positioning for the lane limit (decision 3, R2)

[positioning-lane-limit.md](positioning-lane-limit.md)

**UWB is out.** The plan's fallback is a UWB beacon at the dock, and it has two problems:
- **It isn't licensed.** Under the LIPD Class Licence 2025, clause 67(3), a UWB transmitter must not run from a fixed location outdoors. An open-fronted bay doesn't count as indoors. The robot's own radio is mobile, so it would be allowed.
- **The geometry is weak.** Two beacons 3 m apart give about 1.4 m of sideways error (1σ) at 30 m, which is no better than the gyro.

**Use RTK GNSS instead.** Fit a u-blox ZED-F9P board with Qwiic, so no soldering, and a multi-band antenna: about A$670 per robot. Corrections come free from AUSCORS over the internet first. A base station the whole range shares, about A$690, is added only if needed. With a fix it is accurate to a few centimetres. Keep odometry and the gyro for the first few metres under the roof and whenever the fix drops, and survey each lane as a polygon.

**Trade-offs.**
- About 4× the cost of UWB.
- Needs internet or a base station with open sky.
- Multipath near the roof edge and net poles is untested.
- Whether a beacon set up each session counts as "fixed" is a question for the ACMA.

**Measure.**
- On R0: twenty 30 m out-and-back runs.
- At the pilot range: internet reach 30 m out, and the sky view in front of the bays.

## Changes these imply elsewhere

Suggestions only. None of these files has been edited.

- `docs/PLAN.md`:
  - decision 1: record the name check;
  - decision 2: name the plugin;
  - decision 3: RTK in place of UWB;
  - decision 5: the order of integration, and fix the Japan source;
  - add the clock as a decision.
- `robot/README.md`:
  - "Knowing where it is": the UWB row and the plan;
  - the MTU sentence under the hire key;
  - hire key v2 with "issued at";
  - the clock module in the parts list.

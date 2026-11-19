# How Mulligan knows the time

Researched 2026-11-19.

Mulligan checks that "the time is inside the hire" before it will drive, but it has no network while driving and loses all power when staff swap the 18 V pack. The cheapest trustworthy answer is two parts that back each other up. First, a battery-backed real-time clock on the existing STEMMA QT chain: the Adafruit DS3231 Precision RTC, A$25.85 at Core Electronics and in stock, plus a CR1220 cell. It plugs in with no soldering, drifts about a minute a year and keeps time through every battery swap. Second, the backend's own clock carried in every hire key as a signed "issued at" time, which the robot uses to set the clock forward and to keep a time floor in flash that only moves forward. Then nothing a child controls can move the robot's clock, the clock sets itself from the first key with no Wi-Fi code, and losing the coin cell degrades safely instead of failing open. It needs one 4-byte field added to the hire key, taking it from 78 to 82 bytes. GPS, a clock in the dock, Wi-Fi time and counter-only keys were all looked at. Each is either dearer, lost on a battery swap, or weaker on trust.

## Comparison

Prices are AUD including GST, read from the retailer pages today. "Spoof" means a child, or a parent with a phone, making the robot think it is still inside an expired hire.

| Option | Parts and AUD cost | Accuracy and drift | Survives battery swap? | Can a child spoof it? | Effort for a beginner |
| --- | --- | --- | --- | --- | --- |
| 1a. Adafruit DS3231 STEMMA QT (ADA5188) | A$25.85, plus CR1220 cells (A$0.50 each, minimum 5) and one more 50 mm STEMMA QT cable. About A$30. | ±2 ppm at 0 to 40 °C: about ±5 s a month, ±1 min a year. ±3.5 ppm up to 85 °C. | Yes. About 5 years on the cell (typical figure). | No. Only by opening the shell and pulling the cell, which the robot detects. | Plug in. A well-known library. |
| 1b. Adafruit PCF8523 STEMMA QT (ADA5189) | A$9.50 plus cell. Lead time: dispatch 27 Nov to 1 Dec. | Up to ±2 s a day: about ±1 min a month. | Yes, but only once firmware turns on battery switch-over (off by default). | No, as above | Plug in, plus one register setting |
| 1c. SparkFun RV-8803 Qwiic (BOB-16281) | A$33.95, CR1225 included. In stock. | ±1.5 ppm at 0 to 50 °C: about ±4 s a month | Yes | No, as above | Plug in. A SparkFun library. |
| 1d. SparkFun RV-1805 Qwiic (BOB-14558) | A$30.65, supercapacitor backup, no coin cell. Lead time: 24 to 30 Nov. | Listed at ±2 ppm. SparkFun's worst case is about 3 min a year. | Yes, for about 35 days unpowered (SparkFun's estimate) | No, as above | Plug in. A SparkFun library. |
| 2. Signed time in the hire key ("issued at" plus a floor that only rises) | A$0. Adds 4 bytes to the key. | As good as the backend's clock when the key is signed. It is only a lower bound on the time. | The floor survives (flash). The robot doesn't know how much time has passed since. | No: the time comes from the backend's signature | Firmware only, about 30 lines |
| 2b. Signed time tied to a nonce from the robot (Roughtime style) | A$0. Adds about 12 bytes. Phone must be online at unlock. | Within the round trip, a few seconds | Nothing to survive: fresh at every unlock | No, and old keys can't be replayed at all | Moderate. Changes the unlock flow and the app. |
| 3. Clock in the dock, given to the robot over BLE or a contact | A powered controller, RTC or GPS, and power at every bay. An estimate of A$60 to A$100 a bay, not costed in detail. | As the dock's clock | Yes, if the robot is on the dock | Only if the dock signs its time, which puts a signing key in a public device | High. A second device per bay. |
| 4. Wi-Fi SNTP at the workshop, then the ESP32's own timer | A$0 | ±10 ppm while powered. Internal RC timer in sleep: no figure published. | **No.** Power-on reset clears it. | Not easily, but SNTP has no authentication | Easy, but needs Wi-Fi at every boot |
| 5. Counter keys instead of time | A$0 | No time at all | Yes (flash) | Can't replay an older key, but an unused key never expires | Easy firmware, harder backend |
| 6. GPS, Adafruit PA1010D STEMMA QT (ADA4415) | A$56.70 plus a CR1220 for warm starts | ±20 ns pulse, with the PPS wire | Needs a fix after every swap: 35 s typical cold start, 60 s at most, and only with open sky | Only with a GPS spoofer | Plug in, but needs sky. 36 mA while acquiring. |

## What the robot already has

- **I²C addresses in use.** The Adafruit BNO085 is at 0x4A by default, or 0x4B with DI pulled high ([Adafruit BNO085 pinouts](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts)). The Adafruit INA228 is at 0x40 by default, and its A0/A1 jumpers move it within the 0x40 to 0x4F range ([Adafruit INA228 pinouts](https://learn.adafruit.com/adafruit-ina228-i2c-power-monitor/pinouts)). None of the clocks below clash. The DS3231 and PCF8523 are at 0x68, the RV-8803 at 0x32 and the RV-1805 at 0x69 (sources below), and the PA1010D GPS at 0x10 (*unverified*: no source I read stated it). The DS3231 and PCF8523 would clash with each other, but only one is needed.
- **No 32 kHz crystal on the board.** The ESP32-S3-DevKitC-1 user guide lists no 32.768 kHz crystal among the board's components. It shows GPIO15 and GPIO16, the XTAL_32K_P and XTAL_32K_N pins, wired out to header J1 like ordinary GPIOs ([DevKitC-1 user guide v1.1](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html)). So no crystal is fitted, and adding one would mean soldering. That is an inference from the component list, since the guide doesn't say it outright.

## 1. A real-time clock module over I²C

All four boards below have STEMMA QT or Qwiic sockets, so they join the existing chain (ESP32 → BNO085 → INA228 → clock) with one more cable and no soldering. Each comes with a loose strip of header pins, which the STEMMA QT route doesn't need.

### Adafruit DS3231 Precision RTC, STEMMA QT (ADA5188)

- **Accuracy.** The chip is rated ±2 ppm from 0 to 40 °C and ±3.5 ppm from −40 to 85 °C. Crystal ageing is ±1.0 ppm in the first year and ±5.0 ppm over ten years, though the ageing figure is not production tested ([DS3231 datasheet, Maxim/Analog Devices, mirror](https://courses.physics.illinois.edu/PHYS371/sp2023/code/DS3231.pdf); product page [analog.com/ds3231](https://www.analog.com/en/products/ds3231.html), which timed out when I tried it). Adafruit puts ±2 ppm at "±1 minute per year" ([Adafruit learn guide](https://learn.adafruit.com/adafruit-ds3231-precision-rtc-breakout/overview)). Working it out: 1 ppm is 2.6 s in a 30-day month, so ±2 ppm is ±5.2 s a month, and ±3.5 ppm is ±9 s. The temperature compensation is what keeps it this close in a hot shell on the grass. I did not check how hot the shell gets in a Sydney summer.
- **Address.** I²C address 1101000, which is 0x68 (datasheet, as above).
- **Backup cell.** Takes a CR1220, which is not included ([Adafruit 5188](https://www.adafruit.com/product/5188)). Timekeeping current on the cell is 0.84 µA typical and 3.0 µA at most, at 3.63 V (datasheet). Core's CR1220 is 38 mAh ([Core CR1220](https://core-electronics.com.au/coin-cell-battery-12-5mm-cr1220.html)). Working it out: about 5 years at the typical current and about 1.4 years at the maximum. The cell only runs down while the robot is switched off.
- **Telling when the time was lost.** The datasheet's Oscillator Stop Flag (OSF) is set if the oscillator ever stopped, for example when the cell was pulled. Firmware should treat that flag as "clock not trusted". Adafruit's RTClib reads it as `lostPower()` ([RTClib on GitHub](https://github.com/adafruit/RTClib)).
- **Price and stock.**
  - Core Electronics: **A$25.85**, in stock, same-day dispatch ([Core ADA5188](https://core-electronics.com.au/adafruit-ds3231-precision-rtc-stemma-qt.html)).
  - Little Bird: A$28.05, but none in the Sydney warehouse. It ships from Adafruit's stock in 3 to 16 business days ([Little Bird](https://littlebirdelectronics.com.au/products/adafruit-ds3231-precision-rtc-stemma-qt)).
  - Zaitronics: A$27.10 in search results. *I did not confirm this on their page.*

### Adafruit PCF8523, STEMMA QT (ADA5189)

- **Accuracy.** Adafruit says it "may lose or gain up to 2 seconds a day", about a minute a month ([Adafruit 5189](https://www.adafruit.com/product/5189)). The NXP chip uses an external 32.768 kHz crystal with an offset register for trimming. Backup current is 150 nA typical, and Adafruit says it keeps time for 5 years or more on a CR1220 (not included).
- **Address.** I²C 0x68: read D1h, write D0h ([PCF8523 datasheet, NXP](https://www.nxp.com/docs/en/data-sheet/PCF8523.pdf)).
- **Catch.** At power-up the power-management bits default to 111: "battery switch-over function is disabled" (datasheet, Table 11). Firmware has to set them once, or the board loses the time on every battery swap. Adafruit's library deals with this, but it is easy to miss.
- **Price and stock.** **A$9.50** at Core, with a lead time: dispatch 27 Nov to 1 Dec ([Core ADA5189](https://core-electronics.com.au/adafruit-pcf8523-real-time-clock-breakout-board-stemma-qt-qwiic.html)).

### SparkFun RV-8803, Qwiic (BOB-16281)

- **Accuracy.** ±1.5 ppm (±0.13 s a day) from 0 to 50 °C, and ±3.0 ppm from −40 to 85 °C. It is factory temperature-compensated and has an offset register for ageing. Current is 240 nA ([RV-8803-C7 application manual, Micro Crystal](https://www.microcrystal.com/fileadmin/Media/Products/RTC/App.Manual/RV-8803-C7_App-Manual.pdf)).
- **Address.** I²C 0x32 (manual).
- **Cell.** A CR1225 is included ([SparkFun BOB-16281](https://www.sparkfun.com/products/16281)).
- **Price and stock.** **A$33.95** at Core, in stock ([Core BOB-16281](https://core-electronics.com.au/sparkfun-real-time-clock-module-rv-8803-qwiic.html)).
- **Verdict.** The most accurate of the four. Its libraries are SparkFun's rather than Adafruit's.

### SparkFun RV-1805, Qwiic (BOB-14558), the no-coin-cell choice

- **Backup.** A supercapacitor that "can hypothetically" keep time for about 35 days ([SparkFun BOB-14558](https://www.sparkfun.com/products/14558)).
- **Accuracy.** Listed at ±2.0 ppm, but SparkFun's overview gives a worst case of about ±3 minutes a year. That is roughly ±6 ppm: the chip is not temperature-compensated.
- **Address.** 0x69.
- **Price and stock.** **A$30.65** at Core, with a lead time: dispatch 24 to 30 Nov ([Core BOB-14558](https://core-electronics.com.au/sparkfun-real-time-clock-module-rv-1805-qwiic.html)).
- **Why it matters.** It is the only option with no button cell inside a robot that children will be near.

### Buying the coin cell, and button-battery rules

- **Buying.** Core sells CR1220 cells at A$0.50, in a minimum of five. They go by road only, with no express or air. Checkout asks for a declaration of use, and the page says the cells are for trades and industry, "not for use where children are present" ([Core CR1220](https://core-electronics.com.au/coin-cell-battery-12-5mm-cr1220.html)). Little Bird lists a CR1220 at A$1.85, out of stock in search results. *I did not confirm this on their page.*
- **The rules.** Australia has had mandatory safety standards for consumer goods containing button and coin batteries since June 2022. A user-replaceable cell must sit in a compartment that young children can't easily open, and products are compliance-tested ([ACCC, products containing button and coin batteries](https://www.productsafety.gov.au/business/search-mandatory-standards/button-and-coin-batteries-mandatory-standards/products-containing-button-and-coin-batteries-mandatory-safety-standard)).
- **What that means here.** I have not worked out whether a robot hired out at a range counts as "supplied" consumer goods. For the private proof of concept, keep the cell inside the closed shell on the electronics tray. Before a pilot with children present, either check the standard or swap to the supercap RV-1805. The firmware is the same apart from the driver.

## 2. Time from the phone, signed by the backend

The phone's clock can't be trusted: a child can change it. But the hire key is already signed by the backend, and the backend's clock can be trusted, so the key can carry the backend's time.

### Issued-at plus a floor that only rises

**Why a new field.** The backend writes the time it signed the key into the key. Bytes 5 to 12 (start and end) can't do this job, because a key for a booking later today has a start in the future. A robot that took start as "now" would let a future key validate itself.

**What the robot learns from it.** The real time is at least issued-at. So:

- If its clock is behind issued-at, its clock is wrong and can be set forward.
- It keeps the largest issued-at it has seen as a *floor* in flash, and never believes a time below it.

**Prior art.** This is the pattern Uptane uses for car electronics with no secure clock. Its deployment best practices say electronic control units (ECUs) never accept a time earlier than one already seen and signed with the same key. They also set out the same two failure modes: a clock too far ahead makes valid metadata look expired, and a clock too far behind lets old metadata be replayed ([Uptane deployment best practices 2.1.0, section 3.1](https://uptane.org/docs/2.1.0/deployment/best-practices)).

**What it can't do alone.** A floor is only a lower bound. After the clock is lost, the robot knows "it is at least 10:00" but not that it is now 15:00. So a key that ended at 11:00 would still pass. That is why it is paired with a real-time clock rather than used instead of one.

**Flash.** ESP-IDF's NVS is built for small key-value pairs. It is designed to survive power loss at any point, losing at most the value being written at that moment, and it levels wear by design ([ESP-IDF NVS](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/storage/nvs_flash.html)). A few writes an hour is nothing to it.

### Tying the time to a nonce from the robot (option 2b)

**How it works.**

1. On connect, the robot offers a random nonce.
2. The phone sends the nonce to the backend with its key request.
3. The backend signs the nonce and its current time into the key.
4. The robot accepts only a key carrying its current nonce.

That proves the key, and its time, were made after the nonce existed. So the robot gets fresh trusted time at every unlock and replay becomes impossible.

**Prior art.** This is how Roughtime works. The client sends a 32-byte nonce, and the server returns a signed midpoint time MIDP, an uncertainty RADI, and the nonce, signed with Ed25519, the same scheme the hire key uses ([draft-ietf-ntp-roughtime-19, sections 3, 5.2](https://datatracker.ietf.org/doc/html/draft-ietf-ntp-roughtime-19)). It was published as [RFC 10049](https://www.rfc-editor.org/rfc/rfc10049.html), Experimental, in October 2026. Uptane's earlier Time Server design echoed a nonce back in the same way.

**The cost.**

- The phone must be online at the moment of unlock.
- A key can't be fetched ahead of time.
- A battery swap during a hire means fetching a fresh key.
- The app's flow changes: connect to the robot first, then fetch the key.

That is worth it once keys are worth stealing. It is more than a proof of concept needs.

### Phone-key standards

- **Aliro 1.0.** The Connectivity Standards Alliance released Aliro 1.0 on 26 February 2026 as an open standard for phone-to-reader access over NFC, BLE and UWB. It says it works "in areas without network coverage" ([CSA announcement](https://csa-iot.org/newsroom/introducing-aliro-1-0-a-unified-standard-to-transform-the-access-control-ecosystem/)).
- **CCC Digital Key.** The Car Connectivity Consortium's Digital Key is the car-side equivalent.
- **Unverified.** Both specifications need registration or membership to read. I could not check how their readers handle time when offline, so I have not leaned on them.

## 3. Time from the dock

**What it would take.** The dock would need power, a controller, its own clock or GPS, and a way to tell the robot the time: BLE, or pogo contacts.

**Why that's hard.**

- The dock sits at a public bay, so a dock that broadcasts the time unsigned can be imitated by anyone with a phone running a BLE app.
- Signing the time puts a private key in a device the public can reach.
- The R2 dock is currently a parking spot with no power ([robot/README.md](../../robot/README.md)).
- Every bay would need one. The rough estimate, not costed in detail, is A$60 to A$100 a bay for a controller, clock and power supply.

**When it might make sense.** Once the dock has power for UWB and charging, it could act as a nonce relay for option 2b in bays with poor mobile signal. It is not worth building for the clock alone.

## 4. Wi-Fi SNTP, then the ESP32's own timer

**Setting the time over Wi-Fi.** ESP-IDF's SNTP client is set up with `ESP_NETIF_SNTP_DEFAULT_CONFIG` and `esp_netif_sntp_init()`, and `esp_netif_sntp_sync_wait()` blocks until it syncs. The default resync interval is an hour. The documented API has no authentication ([ESP-IDF system time, v6.1.1](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/system_time.html)).

**Keeping it while powered.** The ESP32-S3 keeps system time with two timers. While it's awake, the high-resolution timer runs off the APB clock with "a frequency deviation of less than ±10 ppm" (same page). That is about ±26 s a month: fine for an hour.

**Keeping it through sleep and resets.** The RTC timer carries time through sleep and resets, except a power-on reset, which clears it (same page). Pulling the 18 V pack is a power-on reset, so the time is gone after every swap. The RTC timer runs off one of these:

- **Default:** the internal slow RC oscillator, "typically about 136 kHz" ([ESP32-S3 datasheet v2.2, RTC clock](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf)). ESP-IDF says its frequency "is affected by temperature fluctuations". Neither document gives a ppm figure.
- **Optional:** an external 32 kHz crystal, which "provides a better frequency stability" for about 1 µA more in deep sleep. The DevKitC-1 doesn't have one.

**Why it can't be the answer.** Even with a crystal, the internal timer cannot survive the swap. This option needs Wi-Fi at every boot, and a range can't promise that out on the grass.

**What it's good for.** Useful at the workshop bench, and as a once-a-year way to pull a fast-running clock back (see below).

## 5. Counter keys instead of time

**How it works.** Each key carries a counter. The robot keeps the last counter it accepted in NVS and rejects anything at or below it. A key is good for one hire, or for N minutes measured by the robot's own uptime.

**What it gets right.** It stops replay of an older key after a newer one is used, with no clock at all.

**What it gets wrong.**

- An unused key never expires. A link saved last month still works if no newer key has reached that robot.
- Uptime resets on a battery swap, so "60 minutes of driving" restarts at every swap unless it is written to flash.
- The backend has to issue counters per robot in strict order, which is awkward when two phones are issued keys for the same hire.

**Verdict.** Issued-at (option 2) gives the same ordering for free, because the backend's clock already only moves forward, and it also carries real time. So counters add nothing here.

## 6. GPS time

**The part.** The Adafruit Mini GPS PA1010D (MTK3333) has STEMMA QT and takes 30 mA while navigating. It has a footprint for an optional CR1220, which is not included ([Adafruit 4415](https://www.adafruit.com/product/4415)). **A$56.70** at Core, in stock ([Core ADA4415](https://core-electronics.com.au/adafruit-mini-gps-pa1010d-uart-and-i2c-stemma-qt.html)).

**Its datasheet** ([CD-PA1010D v0.3](https://cdn-learn.adafruit.com/assets/assets/000/084/295/original/CD_PA1010D_Datasheet_v.03.pdf)):

- Time to first fix: 35 s typical and 60 s at most from cold, 1 s hot.
- 36 mA while acquiring.
- ±20 ns timing on the 1PPS pin.
- Without backup power it does "a lengthy cold start every time it is powered-on".

**Where it falls short.** A child can't spoof GPS, but the robot gets no time under a bay roof, and none for up to a minute after each battery swap. It also costs twice what the DS3231 does. GPS can't do the lane limit either: 3 m accuracy is far too loose for that ([robot/README.md](../../robot/README.md#knowing-where-it-is)). Not worth it for time alone.

## Recommendation for the plan

**Fit an Adafruit DS3231 STEMMA QT clock in R0, and add a signed issued-at time to the hire key, which the robot uses to set its clock forward and keep a floor that only rises.** Buy it with the R0 electronics: the ADA5188, five CR1220 cells and one more 50 mm STEMMA QT cable from Core, about A$30. It goes last on the I²C chain at 0x68. Nothing in the dock, no GPS, and no Wi-Fi code is needed for the clock.

### Why this combination

- **The clock gives an upper bound.** It keeps real time through battery swaps, about a minute a year out, so a link from a finished hire fails.
- **The signed issued-at gives a trusted lower bound.** It sets the clock forward from the backend. No phone or child can move it, and the robot needs no setup step: the first key it sees, bench keys included, sets its time.
- **The floor makes a lost clock fail safely.** If the cell dies, the robot still won't go back past the last time it trusted.

### Suggested change to the hire key (version 2, 82 bytes)

Not applied to robot/README.md; this is a suggestion.

| Bytes | Meaning |
| --- | --- |
| 0 | Version, 2 |
| 1 to 4 | The robot's four serial characters |
| 5 to 8 | Start of the hire, Unix seconds, low byte first |
| 9 to 12 | End of the hire, the same way |
| 13 | Bay number |
| 14 to 17 | **Issued at**: the backend's clock when it signed, Unix seconds, low byte first |
| 18 to 81 | Ed25519 signature over bytes 0 to 17 |

- **Packet size.** A single write of 82 bytes needs an ATT MTU of at least 85, which the app already asks for.
- **Year range.** Keep all times as unsigned 32-bit. That lasts until 2106, while ESP-IDF's own `time_t` is handled separately (see its 2036/2038 notes on the [system time page](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/system_time.html)).
- **Backend.** It must sign with an NTP-synced clock, which serverless hosts provide, and must reject `start > end` itself.

### What the firmware should do

State:

- `floor`: uint32 in NVS, the highest trusted time seen.
- `clock_ok`: a flag in RAM.

**At boot:**

1. Read the DS3231.
2. Set `clock_ok = false` if any of these is true: the read fails, OSF is set, or the time is below `floor`.
3. Otherwise set ESP32 system time from the DS3231 (`settimeofday`) and set `clock_ok = true`.

While running, system time comes from the ±10 ppm crystal-derived timer. Re-read the DS3231 every 10 minutes and write `floor = now` to NVS. That keeps the floor within 10 minutes of the real time at the moment the pack was pulled.

**On unlock**, check in this order. Any failure means state 7, and Drive messages are ignored.

1. Length 82 and version 2. Then the signature, and that the serial is this robot's.
2. Reject `start > end` and `issued_at > end`.
3. Work out the time:
   1. `trusted = max(floor, issued_at)`.
   2. If `!clock_ok`, or `now < trusted`, set system time and the DS3231 to `trusted`, then clear OSF and set `clock_ok = true`.
   3. Never set the clock backwards from a key. A key presented late looks exactly like a fast clock.
4. Accept if `start − 120 s ≤ now < end`. The 2-minute early allowance covers drift between the backend, the clock and a child who turns up early.
5. If `issued_at > floor`, write `floor = issued_at` to NVS.

**During a hire:**

- Check `now < end` once a second. At `end`, brake and return to state 7.
- The app should warn at 5 minutes and at 1 minute before the end. It has `end` from the key.
- Whether to give a minute's grace to drive back to the dock is a product choice. Start with none.

**Telemetry.** Add fault flag bit 4, "clock set from key", raised when `clock_ok` was false at unlock. Staff then know to check the coin cell.

### What a child can and can't do

- **Change the phone clock:** no effect.
- **Replay an old link:** rejected, because the clock has passed its end.
- **Pull the coin cell:** they would have to open the shell. The robot then falls back to the floor and a flag.
- **Replay a key in the narrow gap left after both the cell and the floor have failed:** this only lets a key run until its own end, never past it.
- **Get a refund or end the hire early:** the robot can't hear about either, because the backend can't reach it. The key just runs out within the hour. A staff key that revokes on the spot can come later.

### Trade-offs, and when to revisit

- **Button cell.** If a safety review or the pilot range objects to a coin cell in a robot children are near, swap to the SparkFun RV-1805 (supercapacitor, A$30.65, about 35 days of hold-over). The design is unchanged and the driver changes.
- **A clock that runs fast.** It is never pulled back by keys. At ±2 ppm that is under a minute a year, inside the 2-minute allowance. Resync it from Wi-Fi SNTP at the workshop when the firmware is updated, which is the only time the clock is allowed to go backwards.
- **When to upgrade to nonce-bound keys.** Do it, as option 2b, when keys become worth stealing or sharing: real money, or the public. That ends replay entirely but makes unlock depend on the phone being online at the bay. It would be key version 3, with an 8-byte nonce in place of nothing.
- **Effect on R2.** None from the clock. The dock stays a parking spot and position reference, as planned.

### Settles

The "clock it trusts" open decision in [robot/README.md](../../robot/README.md#control-link-draft) and [docs/PLAN.md](../PLAN.md#decisions). It touches R0 (the parts order, the key format and firmware checks) and app stage 2 (the simulated robot should run the same rules).

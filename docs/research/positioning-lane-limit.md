# Holding the lane: how Mulligan knows where it is

Researched 2026-11-19

**Summary.** The plan's fallback for the lane limit (decision 3) is ultra-wideband (UWB) ranging to a beacon on the dock. There are two problems with it. First, a UWB beacon fixed at an outdoor bay is not authorised under Australia's class licence. The 2025 LIPD class licence lets a UWB transmitter run outdoors only if it is mobile. "Indoors" means walls on all sides, so an open-fronted bay does not count. Second, the geometry is weak. Two beacons 3 m apart at the bay give about ±1.4 m (1σ) of sideways error at 30 m. That is no better than the gyro the plan is trying to beat. RTK satellite positioning has neither problem. The GNSS receiver only listens, and the corrections can come over the internet from Geoscience Australia's free AUSCORS service, or over Wi-Fi from a base station at the range. When the receiver has a "fixed" solution it is accurate to a few centimetres anywhere in the lane. It fails under the bay roof, but the robot does not need it there. A no-soldering robot set (u-blox ZED-F9P board with Qwiic plus an antenna) costs about AUD 670. A base station that one range shares across all its bays costs about AUD 700 more. Recommendation: rewrite decision 3 around RTK GNSS at R2, keep odometry and the gyro for the first few metres and for gaps, and drop UWB.

## Comparison

Costs are AUD including GST, from Australian retailer pages where they could be found. Where only a US price exists it is converted at an assumed AUD 1.53 per USD, with shipping excluded and the figure marked "≈". "Lateral at 30 m" is 1σ unless stated. The lane allows about ±1.3 m: a 3 m bay, less half of the robot's 422 mm width ([robot/DESIGN.md](../../robot/DESIGN.md)). So the target is roughly σ ≤ 0.5 m, which keeps about 95% of positions inside the lane.

| Option | Dock hardware | Robot hardware | AUD per dock + robot | Lateral at 30 m | Near/under bay roof? | No soldering? | AU availability | Compliance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Odometry + gyro, reset at dock (current plan) | Dock only | Encoders + BNO085 (already in the build) | 0 extra | Unknown until R0 is measured. 3° of heading error gives 1.57 m; the BNO085 game vector drifts about 0.5°/min | Yes | Yes | Already bought | None |
| UWB, two anchors at the bay's front corners (b = 3 m) | 2 × Qorvo DWM1001-DEV or DWM3001CDK | 1 of the same | ≈ 155 (3 × ~51) | **1.42 m** (0.1 m range σ) | Anchors yes; robot works in the open | Yes (USB dev kits with headers fitted) | DigiKey AU in stock | **Not authorised**: fixed outdoor UWB, LIPD 2025 cl. 67(3) |
| UWB, two anchors spread over three bays (b = 9 m) | 2 anchors in neighbouring bays | 1 tag | ≈ 155 | 0.48 m | As above | Yes | DigiKey AU | Not authorised, as above |
| UWB, one anchor at the dock + odometry | 1 anchor | 1 tag | ≈ 105 | No better than odometry (range alone gives no sideways information) | As above | Yes | DigiKey AU | Not authorised, as above |
| UWB angle of arrival, one PDoA anchor | Qorvo two-antenna PDoA board | 1 tag | Not priced | ±5° stated gives 2.6 m | As above | Yes (dev kits) | Unverified | Not authorised if the anchor transmits |
| **RTK GNSS, internet corrections (AUSCORS NTRIP)** | Nothing (the dock still gives the start pose) | SparkFun GPS-RTK-SMA (ZED-F9P, Qwiic) + multi-band antenna | **≈ 670** | **~1–2 cm when fixed**; float 0.2–1 m | No fix under the roof; a fix within seconds once outside | Yes (Qwiic to the STEMMA QT chain) | DigiKey AU, Core Electronics | Receive-only. The internet link is the phone or range Wi-Fi |
| RTK GNSS, own base at the range | Same board + antenna on a mast with open sky, plus an ESP32 to relay corrections over Wi-Fi / ESP-NOW | As above | ≈ 1,360 for the first bay; each further bay adds only a robot (≈ 670) | ~1–2 cm when fixed | As above; the base antenna must not sit under the roof | Yes | As above | 2.4 GHz link is fine under LIPD Part 8 |
| RTK, cheaper receiver (Quectel LG290P) | Same idea | SparkFun LG290P breakout + antenna | ≈ 530 robot only | 0.8 cm + 1 ppm (stated) | As above | **No**: its I²C is "under development", so UART pins need headers soldered | Core Electronics (lead time) | As above |
| Perimeter wire per lane | Signal generator + ~65 m pegged wire per lane | Coil sensor + amplifier | Not priced reliably | Exact at the wire (it is a fence, not a position) | Yes | **No** (DIY sensor kits are soldering kits) | Mower shops sell wire and pegs | Low-frequency wire signal; not checked |
| BLE signal strength | Phone or beacon | ESP32 radio | 0 | Not usable for lateral | Yes | Yes | n/a | Fine |

## 1. Ultra-wideband

### The compliance problem (decisive)

UWB in Australia is authorised by the [Radiocommunications (Low Interference Potential Devices) Class Licence 2025](https://www.legislation.gov.au/F2025L01047/asmade/2025-09-05/text/original/word). It started on 1 October 2025 and replaced the 2015 licence. In Schedule 1, Part 10, Table 10:

- **Item 7, "Ultra-wideband radiocommunications transmitters"**, 3100–4800 MHz and 6000–9000 MHz. This covers DW1000/DW3000 channel 5 (~6.5 GHz) and channel 9 (~8 GHz). Power is set by ETSI EN 302 065-1.
- **Clause 67(3)**: "A radiocommunications transmitter must not be operated from a fixed location, otherwise than indoors." The note to it says the transmitter "may be operated outdoors if it is mobile." Clause 67 also bans use on board aircraft and use within the set distances of the Parkes, Narrabri (Paul Wild) and Canberra Deep Space sites (3–10 km). Sydney is outside all of these.
- **Item 9, "In-ground ultra-wideband"** (4200–4800 MHz and 6000–6800 MHz) carries no fixed-location ban. It is limited to −62 dBm/MHz, about 20 dB below normal UWB. On free-space reasoning (my estimate, not tested), that cuts range roughly tenfold, so it does not help at 30 m.

"Indoors" is defined in the [Radiocommunications (Interpretation) Determination 2025](https://www.legislation.gov.au/F2025L00362/latest), as amended by [F2025L00711](https://www.legislation.gov.au/F2025L00711/asmade/2025-06-20/text/original/epub/OEBPS/document_1/document_1.html). It means a space "enclosed by permanent walls on all sides, a permanent roof and a permanent floor" and "permanently fixed to a location". A driving-range bay is open at the front, so it is not indoors.

The robot's own UWB radio is mobile and allowed. The beacon on the dock, or on the bay posts, is a transmitter at a fixed outdoor location, which is exactly what clause 67(3) excludes. With two-way ranging (TWR) the anchor has to transmit its replies. The ban was raised during consultation and kept. The [UWB Alliance's May 2025 submission](https://uwballiance.org/wp-content/uploads/2025/05/UWB-Alliance-Consultation-Remaking-LIPD-class-licence.pdf) asked the ACMA to "reconsider this restriction", noting that Europe (ECC Decision (06)04) now allows fixed outdoor use, but the 2025 instrument still contains it. This applies to a private proof of concept as much as to a product: the class licence is what makes operating the transmitter lawful at all.

Possible ways round it, none of which suits this build:

- A "portable" beacon set up for each session. Whether it then counts as operating "from a fixed location" is a legal question. **Unverified; ask the ACMA or a compliance consultant** before relying on it.
- Receive-only fixed anchors (uplink TDoA, or a receive-only angle-of-arrival anchor), so that only the mobile robot transmits. TDoA anchors need synchronised clocks, and commercial systems usually sync by radio from a master anchor, which is itself a fixed transmitter. Wired sync or custom firmware is not beginner work. **Unverified as a design.**
- An ACMA apparatus or scientific licence. Not investigated.

### Modules, for the record

| Board | Chip | Method | Stated accuracy / range | Connects | AUD, where |
| --- | --- | --- | --- | --- | --- |
| [Qorvo DWM1001-DEV](https://www.digikey.com.au/en/products/detail/qorvo/DWM1001-DEV/7394533) | DW1000 (ch 5) in a module with an nRF52 | TWR, using Qorvo's PANS RTLS firmware with a UART/SPI/BLE API | 10 cm accuracy, 60 m line of sight typical ([DWM1001 datasheet copy](https://projects.gctronic.com/elisa3/uwb/DWM1001_Datasheet.pdf)) | USB with on-board J-Link, Raspberry Pi header | ~51.39 inc GST, DigiKey AU, 959 in stock (search snapshot). [element14 AU](https://au.element14.com/qorvo/dwm1001-dev/devel-kit-ultrawideband-transceiver/dp/4683741) ~56.79, long lead time |
| [Qorvo DWM3001CDK](https://www.digikey.com.au/en/products/detail/qorvo/DWM3001CDK/24367348) | DW3110 (ch 5 and 9) + nRF52833 | TWR. Single antenna, so no angle of arrival | ~10 cm | USB, J-Link, headers fitted | ~51.29 inc GST, DigiKey AU |
| [Makerfabs ESP32 UWB DW3000](https://makerfabs.com/esp32-uwb-dw3000.html) | DW3000 + its own ESP32 (WROOM/WROVER) | TWR in your own Arduino code | Accuracy not stated. Range quoted as 20 m by Makerfabs and 45 m on Tindie ([search summary](https://www.tindie.com/products/28382)) | Micro-USB. Could talk to the S3 over UART | US$43.80 (≈ 67) + shipping, from Makerfabs (China) |
| [Makerfabs ESP32 UWB Pro / High Power](https://makerfabs.com/esp32-uwb-high-power-120m.html) | DW1000 + PA | TWR | Longer range claimed (120–200 m). Unverified | Micro-USB | US$52–65 |
| [Ai-Thinker BU03 kit](https://core-electronics.com.au/ultra-wide-band-module-development-kit-bu03.html) | DW3000 + STM32 | TWR / TDoA / PDoA claimed, AT commands over UART | "10 cm" (reseller claim) | USB, UART | Core Electronics (price not retrieved) |
| [M5Stack Unit UWB](https://docs.m5stack.com/en/unit/Unit_UWB) | Ai-Thinker BU01 (DW1000) + STM32 | TWR / TDoA, AT commands at 115200 baud | 10 cm | Grove cable (UART) | Not found at an AU retailer. ~£50 in the UK |
| [iLabs Challenger RP2040 UWB](https://core-electronics.com.au/challenger-rp2040-uwb-dwm3000.html.md) | DWM3000 + RP2040 | Own code | Not stated | Feather, USB-C | 129.95, Core Electronics |

Not checked in detail: the Mikroe UWB click, and the NXP SR150 / Murata Type 2BP. The NXP and Murata parts are surface-mount modules that need a carrier board, so they are not beginner parts. Several users report much shorter real ranges than the datasheets once multipath and enclosures are involved: [Qorvo forum](https://forum.qorvo.com/t/dwm1001-dev-pans-distance-accuracy/22498), and Ai-Thinker's [BU03 tutorial](https://www.hackster.io/ai-thinker/ranging-tutorial-of-bu03-kit-a9d669) warns that enclosures cause "significant measurement deviation". **Real outdoor range at 30 m with the antenna 20 cm off the grass is unverified.**

Angle of arrival: Qorvo states ±5° for angle measurement on its PDoA parts ([DW3210 page](https://www.qorvo.com/products/p/DW3210)). It needs two chips or a two-antenna board, and the angle comes from a lookup table calibrated for that antenna. Qorvo staff on the [forum](https://forum.qorvo.com/t/angle-bearing-of-decawave-device/10497/4) give the good field of view as about ±60°. At 30 m, ±5° is 30 × tan 5° = **2.6 m**, worse than the gyro.

## 2. Geometry

Put the two anchors at the bay's front corners, (−b/2, 0) and (+b/2, 0), with the robot on the lane centreline at distance y. Each range r₁, r₂ has independent noise σ. Linearised, the difference of the two ranges carries the sideways position:

r₁ − r₂ ≈ b·x / R, with R = √(y² + (b/2)²)

so

σ_x = σ · √2 · R / b

The distance up the lane (from r₁ + r₂) is good: about σ/√2. The sideways error grows linearly with distance, because the 3 m baseline subtends a small angle seen from 30 m. With σ = 0.10 m (the usual "±10 cm" claim):

| Distance out | b = 3 m (one bay) | b = 9 m (three bays) |
| --- | --- | --- |
| 10 m | 0.48 m | 0.17 m |
| 20 m | 0.95 m | 0.32 m |
| 30 m | **1.42 m** | 0.48 m |

At 30 m the one-bay pair gives ±2.8 m at 95%, wider than the bay. A bias that differs between the two anchors (antenna delay, one anchor partly blocked by a bay post) moves the answer by R/b times that bias: 5 cm of differential bias is 0.5 m at 30 m.

Other layouts, computed the same way:

- **Anchors at all four corners of the lane** (the two bay corners plus two at 30 m): 0.43 m at 10 m, 0.50 m at 15 m and 0.07 m at 30 m. Good, but it puts two fixed boxes 30 m out where balls land and the picker tractor drives. It is equally unlicensed.
- **One anchor at the dock and one 30 m out on the centreline**: both ranges run almost along the lane, so sideways error goes to infinity on the centreline (3.1 m even 0.3 m off it). Useless.
- **One anchor at the dock plus odometry and gyro**: the range fixes distance and wheel-slip scale, which matters for the far-end limit, but adds nothing sideways. Lateral error stays at r × heading error: 1.57 m at 30 m for 3°.
- **Angle of arrival from one anchor**: lateral ≈ r × tan(angle error), so 2.6 m at 30 m for ±5°.

Range-only beacons placed behind the robot cannot hold a long, thin lane. Only anchors beside or beyond the robot can, and those sit on the live field.

## 3. RTK GNSS

### Accuracy and receivers

| Board | Stated RTK accuracy | Connects | Price |
| --- | --- | --- | --- |
| [SparkFun GPS-RTK2](https://www.sparkfun.com/sparkfun-gps-rtk2-board-zed-f9p-qwiic-gps-15136.html) / [GPS-RTK-SMA](https://www.sparkfun.com/sparkfun-gps-rtk-sma-breakout-zed-f9p-qwiic.html) (u-blox ZED-F9P) | 0.010 m horizontal; 2.5 m without RTK | 2 × Qwiic (I²C works), USB-C, UART pins (no headers fitted). U.FL (RTK2) or SMA (RTK-SMA) antenna socket | US$259.95. AU: [DigiKey AU GPS-RTK-SMA](https://www.digikey.com.au/en/products/detail/sparkfun-electronics/16481/12178437) ~446.73 inc GST; [Little Bird GPS-RTK2](https://littlebirdelectronics.com.au/products/sparkfun-gps-rtk2-board-zed-f9p-qwiic.md) 575.96 |
| [SparkFun Quadband LG290P](https://core-electronics.com.au/sparkfun-quadband-gnss-rtk-breakout-lg290p-qwiic.html) (Quectel) | 0.8 cm + 1 ppm, 5 s RTK convergence, 10–20 Hz | Qwiic fitted, but "only the UART interface is supported" for now ([SparkFun](https://www.sparkfun.com/sparkfun-quadband-gnss-rtk-breakout-lg290p-qwiic.html)), so pins need soldering | 309.95 inc GST, Core Electronics, dispatch 24–30 Nov |
| [SparkFun ZED-X20P](https://www.sparkfun.com/sparkfun-allband-gnss-rtk-breakout-zed-x20p-qwiic.html) (u-blox, successor to the F9P) | Centimetre-level; under 7 s convergence vs under 10 s for the F9P ([SparkFun comparison](https://learn.sparkfun.com/tutorials/whats-the-difference-between-the-zed-f9p-and-the-zed-x20p)) | Qwiic | US$299.95. [Little Bird](https://littlebirdelectronics.com.au/products/sparkfun-allband-gnss-rtk-breakout-zed-x20p-qwiic) lists it (price not retrieved) |
| [ArduSimple simpleRTK2B](https://ardupilot.org/copter/docs/common-ardusimple-rtk-gps-simplertk2b-budget.html) (ZED-F9P) | As F9P | Arduino-Uno shape; ArduSimple says headers must be soldered unless bought with them | DigiKey AU ~437 inc GST (no-headers variant) |
| Unicore UM980 boards | Not checked | | |
| Antenna: [GNSS multi-band magnetic mount (u-blox ANN-MB-00), 5 m SMA](https://core-electronics.com.au/gnss-multi-band-magnetic-mount-antenna-5m-sma.html) | L1/L2 | SMA | 219.95 inc GST, Core Electronics |

The ZED-F9P on Qwiic is the no-soldering choice. It plugs into the same STEMMA QT / Qwiic I²C chain as the BNO085 on GPIO 8/9. SparkFun's u-blox Arduino library can feed it corrections over I²C (stated in SparkFun's library examples; not re-checked here). A cable adapter may be needed between the U.FL socket and an SMA antenna; the RTK-SMA variant avoids that.

### Corrections in Sydney

- **AUSCORS NTRIP broadcaster (Geoscience Australia).** Free real-time RTCM 3 corrections after registering ([GA GNSS Data Centre](https://data.gnss.ga.gov.au/docs/home/gnss-data.html), [AUSCORS](https://www.auscors.ga.gov.au), [GA authentication docs](https://data.gnss.ga.gov.au/docs/home/auth.html)). Single-base RTK degrades about 1 ppm with distance, so 1 cm at 10 km. ArduSimple gives a practical limit of about 35–50 km ([ArduSimple, Australia casters](https://www.ardusimple.com/rtk-correction-services-and-ntrip-casters-in-australia/)). **The nearest AUSCORS mountpoint to the pilot range is not yet checked.** The robot's ESP32-S3 can run an NTRIP client over the range's Wi-Fi or a phone hotspot.
- **CORSnet-NSW.** A dense state network, but real-time access is sold through resellers ([NSW Spatial Services FAQ](https://www.spatial.nsw.gov.au/surveying/corsnet-nsw/faqs)). It is a paid fallback.
- **u-blox PointPerfect Flex.** From about US$5.90/month, quoted at 1 cm (RTK) or 2–4 cm (SSR) ([ArduSimple](https://www.ardusimple.com/rtk-correction-services-and-ntrip-casters-in-australia/)).
- **Own base station.** A second identical receiver on a mast with open sky (on the clubhouse or a pole), not under a bay roof. Mower makers do exactly this: Husqvarna's EPOS reference station needs "open sky" and power, and gives "typically better than 2 cm" ([Husqvarna AU, navigation accuracy](https://www.husqvarna.com/au/support/articles/automower-robotic-lawn-mower-navigation-accuracy-ka-01692/), [EPOS](https://www.husqvarna.com/au/learn-and-discover/husqvarna-epos/)). One base serves every bay at the range. It sends corrections over 2.4 GHz Wi-Fi or ESP-NOW, which the LIPD class licence covers in Part 8 (2400–2483.5 MHz digital modulation, 4 W EIRP, PSD limit in cl. 43). There is no fixed-location ban there.
- **SouthPAN (no base, no internet).** Official targets from [GA's SouthPAN FAQ](https://ga.gov.au/scientific-topics/positioning-navigation/positioning-australia/about-the-program/southpan/southpan-frequently-asked-questions), via [LINZ](https://www.linz.govt.nz/sites/default/files/doc/southpan_factsheet_early-epen-services_20220901.pdf):
  - L1 SBAS: ≤ 3 m (95%).
  - DFMC SBAS: ≤ 1 m.
  - PPP via SouthPAN (PVS): ≤ 0.40 m horizontal (95%), with a convergence target of 80 minutes ([ICG-17](https://www.unoosa.org/documents/pdf/icg/2023/ICG-17/icg17.02.02.pdf)).

  None of these holds a 3 m lane from a cold start, and whether DFMC and PVS are operational yet is unclear ([Spatial Source](https://www.spatialsource.com.au/?p=40376)).

### Where RTK fails

- **Under the bay roof.** There is no fix in the dock. Once the robot is in the open, the receiver should regain a fix within seconds: SparkFun quotes 5 s for the LG290P and under 10 s for the F9P. The first few metres out of the bay are exactly where odometry from the dock is still good (3° over 5 m is 0.26 m), so the two cover each other.
- **Float, not fixed.** A float solution can be tens of centimetres to about 1 m out ([LeFixea](https://www.lefixea.com/article/rtk_float_fix_doesnot_change1)). The firmware must read the carrier-solution flag and treat anything except "fixed" as "fall back to odometry and limit the distance".
- **Multipath.** Signals reflect off the bay roof edge, steel net poles, buildings and fences ([RTKdata](https://rtkdata.com/rtk-multipath-fix-dropouts/)). Whether range netting matters is unverified. This has to be measured at the pilot range.

### Heading

A single antenna gives heading only from motion (course over ground), which is fine while driving, fused with the gyro. Dual-antenna "moving base" heading needs two receivers, which doubles the cost ([u-blox ZED-F9P moving base note](https://www.mouser.lt/pdfDocs/u-blox_ZED-F9P-04B_MBA.pdf)), and a long baseline. A forum rule of thumb, atan(2 cm / baseline), gives about 3° on the robot's ~0.37 m track ([ArduPilot forum](https://discuss.ardupilot.org/t/ublox-zed-f9p-l1-l2-gnss-unit/31511/78); not an official figure). That is not worth it: with centimetre position the lane limit no longer depends on heading, and only the "range-terms" stick mode in [robot/README.md](../../robot/README.md) needs heading.

### Gyro drift, for comparison

The BNO08x game rotation vector (gyro plus accelerometer, no magnetometer) is specified at 2.5° dynamic error and 0.5°/min heading drift ([SparkFun BNO086 listing](https://www.sparkfun.com/products/22857); the BNO085 is assumed to match, not checked against the CEVA datasheet). A three-minute fetch is therefore about 1.5° from the gyro alone, before wheel scrub on grass, which is 0.8 m at 30 m.

## 4. Cheap backstops

- **BLE signal strength.** It measures distance only, not side. Received strength on 2.4 GHz moves by several dB with orientation, bodies and wet grass, which is tens of percent in distance (general knowledge, not sourced here). At best it is a crude "too far" alarm for the far-end limit.
- **Perimeter wire.** This is how robotic mowers have worked for decades. A generator drives a loop and a coil on the robot senses which side of the wire it is on. Husqvarna caps the loop at 800 m and pegs or buries the wire 1–20 cm deep ([Husqvarna boundary-wire article](https://us-support.husqvarna.com/en/automower/KA-70234); [manual](https://www.manualslib.com/manual/1121217/Husqvarna-420.html?page=23)). One lane is about 65 m (two 30 m sides and the far end), and neighbouring lanes can share a side. It is exact at the wire and works under the roof. Against it:
  - the range has to agree to wire being pegged into its field, where it is mowed and the ball picker drives over it;
  - the robot gets a hard edge but no position;
  - the sensor and generator are DIY electronics (the RobotShop [perimeter kit](https://www.robotshop.com/en/robotshop-perimeter-wire-generator-sensor-soldering-kit.html) is a soldering kit, and a buyer reports its receiver didn't work).

  Mower makers are moving away from wire to RTK "virtual boundaries" (Husqvarna EPOS, above), and that points the same way as this recommendation.

## 5. Cost per dock + robot pair (AUD, inc GST)

| Option | Parts | Total |
| --- | --- | --- |
| Odometry + gyro | Already in the R0 build | 0 |
| UWB, two corner anchors + tag | 3 × DWM1001-DEV (51.39) or DWM3001CDK (51.29) + USB power at the dock | ≈ 155–170 |
| UWB, one anchor + tag | 2 × dev kit | ≈ 105 |
| RTK, AUSCORS corrections | GPS-RTK-SMA (446.73, DigiKey AU) + ANN-MB-00 (219.95, Core) | **≈ 667** |
| RTK, own base (first bay) | Robot set (667) + base set (667) + an ESP32 dev board to relay corrections (~25, unverified) | ≈ 1,360. Each extra bay ≈ 667 |
| RTK, LG290P (needs soldering) | 309.95 + 219.95 per receiver | ≈ 530 robot, ≈ 1,060 with base |
| Perimeter wire | Wire, pegs, generator, sensor | Not priced (prices not found) |

Prices are from retailer pages and search snapshots on 2026-11-19; confirm before ordering.

## Recommendation for the plan

**Decision 3 (robot stage R2): replace "plan for ultra-wideband ranging to the dock" with "plan for RTK GNSS on the robot, with odometry and gyro from the dock".**

- **Why not UWB.**
  - A fixed outdoor UWB beacon is not authorised under LIPD Class Licence 2025 clause 67(3), and an open bay is not "indoors".
  - Even if it were, two beacons 3 m apart give about 1.4 m (1σ) sideways at 30 m, which is about the same as the gyro error it was meant to fix.
  - The robot README's "two beacons give a position" is true along the lane but not across it.
- **What R2 should be.**
  - Robot: a ZED-F9P Qwiic board and a multi-band antenna on the robot's roof, plugged into the existing I²C chain (≈ AUD 670).
  - Corrections: from AUSCORS over NTRIP through the range Wi-Fi or a phone hotspot first. Add a shared base station at the range (≈ AUD 690) only if AUSCORS gives poor fixes there.
  - Lane: survey each lane once by driving the robot to the bay's front corners and to the 30 m line, and store it as a polygon.
  - Firmware rules:
    - inside the first ~5 m, or whenever the fix is not "RTK fixed", steer by odometry and gyro from the dock and cap the distance;
    - with a fixed solution, enforce the lane polygon and the far-end limit directly.
  - The dock keeps its job: a known start pose and the leg under the roof.
- **Trade-offs.**
  - Cost: about AUD 670 per robot against about 155 for UWB.
  - Dependencies: it needs internet at the range, or a base with a sky view.
  - Roof: it needs a fallback under and just outside the roof.
  - Unknowns: multipath near the roof edge and net poles is unknown until tested at the pilot range.
  - In return it gives centimetres across the whole lane, with nothing fixed on the field and nothing that needs a radio licence beyond the class licence.
  - The pilot fallback from the plan (end bays, or an empty bay either side) still stands for R2 runs before RTK is proven.
- **What to measure on R0 to decide.**
  1. Odometry + gyro sideways error: twenty 30 m out-and-back runs on grass (wet and dry), measured against a string line. If 95% of runs stay within ±1 m at 30 m, R2 can start without RTK and add it later. Expect not.
  2. Gyro heading drift over a realistic three-minute fetch with the BNO085 game rotation vector, standing and driving.
  3. Distance scale error from wheel slip at 30 m, for the far-end limit.
  4. At the pilot range, before buying: how far the nearest AUSCORS mountpoint is, whether Wi-Fi or mobile data reaches 30 m out, and the sky view in front of the bays (roof edge, nets, poles).
  5. Once the receiver arrives: the time to an RTK fix after rolling out from under the roof, and the fixed/float ratio along the lane.
- **Open items to settle before R2:**
  - Whether a "portable" UWB beacon counts as a fixed location. Only matters if UWB comes back; ask the ACMA or a compliance consultant.
  - Range permission for anything fixed on the field.

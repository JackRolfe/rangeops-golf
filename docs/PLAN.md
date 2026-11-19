# RangeOps build plan

What gets built, in what order, and what is still undecided. The robot's own plan is in [robot/README.md](../robot/README.md); this document covers the whole offering and how the pieces meet.

## What we are building

A family arrives at a driving range. They booked the bay and paid for the bucket in the app. A robot is waiting at the bay. The kids hit, play a target game, and when a shot dribbles twenty metres they drive the robot out to fetch it and hit it again. The range sold a bay, a bucket and a robot hire without anyone at the counter, and nobody walked onto the grass.

Four things make that happen:

| Piece | Who uses it | State today |
| --- | --- | --- |
| RangeOps app | Golfers and families, on a phone | Practice tracking works: upload a range image, set a target, tap where shots land, see accuracy by session and by club. Offline, no account. |
| Mulligan, the robot | A child at the bay, through the app | Not built. Target spec and build plan written. |
| Backend | The app and the console | Does not exist. Nothing needs it until booking. |
| Range console | Range staff | Does not exist. |

The site's phone demo already shows the finished app: four tabs called Drive, Games, Book and Balls. That demo is the design target for the app.

## How the pieces connect

```
                      ┌──────────────────────┐
   golfer's phone     │     RangeOps app     │
                      │ Games  Drive  Book   │
                      │        Balls         │
                      └───┬──────────────┬───┘
            Bluetooth LE  │              │  HTTPS
          (at the bay)    │              │
                 ┌────────▼───┐    ┌─────▼──────────────┐
                 │  Mulligan  │    │      Backend       │
                 │   robot    │    │ bookings, payments │
                 └────────────┘    │ ball codes, fleet  │
                                   └─────▲──────────────┘
                                         │  HTTPS
                                   ┌─────┴──────────────┐
                                   │   Range console    │
                                   └────────────────────┘
```

Three rules keep these from tangling:

1. **The robot never depends on the internet.** Driving is phone to robot over Bluetooth. Every safety rule (speed cap, stop on lost signal, lane limit) is enforced in the robot's firmware, so a buggy app or a dead network cannot make it unsafe.
2. **Practice works without an account.** Games and accuracy history stay local-first, as they are now. An account is only needed to book, pay or hire a robot.
3. **The backend only knows about hires, not driving.** It records that a robot is hired to a bay for an hour and issues a signed hire key for it. The robot checks the key itself, with no network ([control link](../robot/README.md#control-link-draft)). The backend is never in the control loop.
4. **Every piece a range might already have can be swapped out.** See [Built to swap](#built-to-swap).

## Built to swap

RangeOps builds the whole offering itself: booking, balls, games, the console and the robot. But many ranges already run some of it on another platform, and the one RangeOps most wants to work with is [Sweetspot](https://sweetspot.io). Sweetspot runs bay booking, payments, ball dispensers and bay unlocking for 300 to 500+ facilities in the Nordics, the UK and the US, and works with Toptracer and Range Servant. **There is no partnership.** It's a goal, and nothing should say or imply otherwise until there is one in writing.

So each piece sits behind one boundary, and a range, or Sweetspot, can replace it without the others changing:

| Piece | RangeOps builds | Could be replaced by | The boundary |
| --- | --- | --- | --- |
| Booking and payment | Book tab and backend | Sweetspot, or the range's own system | The backend takes a booking from any source and turns a robot add-on into a hire key |
| Balls | Balls tab and bucket codes | Sweetspot with Range Servant, or the range's ball machine | A bucket is a code or PIN; where it was bought doesn't matter to the rest |
| Games and tracking | Games tab, tap to mark | Toptracer or TrackMan on the bay screen | Games are local to the app and nothing else depends on them |
| Range console | `apps/console` | Sweetspot's Club Portal | Robot status comes from one fleet API, which a partner's portal could read too |
| **The robot and Drive** | **Mulligan, hire keys, the Drive tab** | **Nothing. This is what no one else makes.** | The [control link](../robot/README.md#control-link-draft) and hire keys |

Nothing is removed in advance. If Sweetspot is interested, the pieces they already do can be switched to theirs at that point. The first thing to show them would be the robot working, on video. Their [partnerships page](https://sweetspot.io/partnerships) invites companies to get in touch, and mentions one API for bookings, sales and player data, but publishes no developer documents.

## Decisions

Made, and reflected in this repository:

- **One name.** RangeOps is the offering and the app. Mulligan is the robot only.
- **One repository**, with the app, site, robot and plan side by side.
- **One web property.** The site is at `/` and the app at `/app/`, built together and published to GitHub Pages on every push to `main`.
- **One brand.** The app and site share colours and type from `packages/brand`.

Open, with a recommendation for each:

| # | Decision | Recommendation | Needed by |
| --- | --- | --- | --- |
| 1 | Is the name RangeOps free to use? | Check trademarks and domains in the launch country before printing anything. Nothing has been checked yet. | Before the pilot |
| 2 | How does an iPhone talk to the robot? Safari on iPhone and iPad has no Web Bluetooth, so the web app cannot drive the robot there. | Wrap the existing React app in Capacitor and use a native Bluetooth plugin. Keep the web app for everything else. Use Web Bluetooth in Chrome on Android or a laptop for bench testing, since it needs no app store. | App stage 3 |
| 3 | How does the robot know where it is, to hold the lane limit? | Start with wheel odometry and a gyro, reset at the dock. Expect it to be too loose for a single-bay lane at 30 m, and plan for ultra-wideband ranging to the dock. See the robot plan. | Robot stage R2 |
| 4 | Backend stack | GitHub Pages serves static files only, so booking needs a host for an API. A small TypeScript API on serverless functions with Postgres, and Stripe for payments. Choose the host when stage 4 starts; the site and app can stay on Pages. | App stage 4 |
| 5 | How does a paid bucket reach the ball machine? | Depends entirely on the pilot range's dispenser. For the pilot, staff see the order in the console and hand over the bucket. Integrate with the machine only once a range commits. Japan shows another route: a payment unit added to an existing dispenser. | Pilot |
| 8 | Sweetspot | Build everything, behind the boundaries in [Built to swap](#built-to-swap). Approach them once R1 works on video, after checking the RangeOps name. They appear to have no Australian ranges, so ask where a trial could run. | After R1 |
| 6 | Launch country and currency | The demo shows dollars and the tests use the Australian locale. Confirm, because it sets the payment setup, the radio compliance mark the robot needs and the trademark search. | App stage 4 |
| 7 | Repository and domain names | Rename the GitHub repository to `rangeops` and point a RangeOps domain at the Pages site. `mulligan-range-robot` is already archived. | When convenient |

## The app

The app grows from one feature into the four tabs in the demo. Each stage ships on its own.

**Stage 1. Games.** Turn the practice tracker into the Games tab.

- Move from the current home, history and settings screens to a tab bar, with Games first. Practice sessions, history and the accuracy chart move under it.
- Add a `mode` to a session: `bullseye` is what the app does today. `shrink` is Shrink the Ring, where three on-target shots in a row shrink the ring by a fifth, down to a floor. The rule is already written in the site demo (`replay()` in `apps/site/index.html`); port it into `apps/player/src/domain` with tests.
- A shrinking ring means the target is no longer fixed for a session. Store the ring radius with each shot, and bump the IndexedDB version with a migration that back-fills old shots from their session's target.
- Beat Your Best needs no new data: it is the existing accuracy history, filtered by club, framed as a score to beat.

Done when: a child can play both games start to finish on a phone, and existing users keep their history after the update.

**Stage 2. Drive, against a simulated robot.** Build the Drive tab before the robot exists.

- Define one interface, `RobotLink`: connect, send a drive command, receive telemetry (battery, balls on board, state, faults), disconnect.
- Write `SimulatedRobot` behind that interface by porting the lane, pickup and lane-limit logic from the site demo. Build the joystick and the Drive screen against it.
- The message shapes in `RobotLink` are the same ones the firmware speaks, defined in the [draft control link](../robot/README.md#control-link-draft). Agreeing on them here is what lets the app and the robot be built at the same time.

Done when: the Drive tab works end to end against the simulator, including the stop-on-release and lane-limit messages.

**Stage 3. Drive, against the real robot.**

- Write `BleRobot` behind the same interface. Test with Web Bluetooth in Chrome first.
- Add the Capacitor shell for iPhone and iPad and ship through TestFlight.
- Pairing for now is by proximity: the app lists robots it can hear and the user picks the one at their bay. Hire-based keys come with the backend.

Done when: a phone drives robot stage R1 around a field and the on-screen telemetry matches the robot.

**Stage 4. Book and Balls.** The first stage that needs accounts, a backend and money.

- Accounts by email link. Practice data stays on the device; signing in adds bookings, it does not move the history.
- Backend records: range, bay, opening hours and prices, booking, order, bucket code, robot, hire.
- Book: pick a day, a time and a bay, add the robot, pay. Balls: pick a bucket, pay, get a code.
- When a robot is hired with a booking, the app receives a key that lets it connect to that robot for that hour only.
- A RangeOps range publishes its own range map, so players at that range skip the upload step in Games.

Done when: a real payment books a real bay and the range can see it.

**Stage 5. Range console.** A web app for staff, as a new `apps/console`: set up bays, hours and prices; see today's bookings and orders; hand over buckets against codes; see each robot's battery, state and which bay it is hired to.

Done when: the pilot range can run a day without asking us for anything.

## The robot

Summarised here. The build plan is in [robot/README.md](../robot/README.md) and the design, with drawings and a parts list, is in [robot/DESIGN.md](../robot/DESIGN.md).

| Stage | What it is | Proves |
| --- | --- | --- |
| R0 | Bench rover: a driven chassis, firmware, Bluetooth link | Hold-to-drive, stop on lost signal, speed cap, runtime estimate |
| R1 | Pickup: the ball corral on the rover, on real grass | It collects and carries ten balls and comes home |
| R2 | Lane limit and dock | It stays in its lane and within 30 m, and re-zeros its position at the bay |
| R3 | Pilot build: shell, flag, strike protection, a few units | It survives a range and a week of children |

## Order of work

The app and the robot are separate tracks that only need each other at two points, so they can run in parallel.

```
App     Stage 1 Games ──► Stage 2 Drive (sim) ──► Stage 3 Drive (real) ──► Stage 4 Book, Balls ──► Stage 5 Console
                                 ▲                        ▲                                              │
                        agree the control link     first real drive                                      ▼
                                 ▼                        ▼                                            Pilot
Robot   R0 Bench rover ─────────────────────────► R1 Pickup ──► R2 Lane limit, dock ──► R3 Pilot build ──┘
```

The first three things to do:

1. **Prototype the pickup by hand.** Before any electronics, build the pen and gate from the robot's own parts ([robot/BUILD.md](../robot/BUILD.md)) and push it over balls on a range mat and on grass. It is the one part of the robot with no off-the-shelf answer, and everything else is sized around it.
2. **Build R0** from goBILDA parts, as in [robot/BUILD.md](../robot/BUILD.md), and settle the control link while doing it.
3. **Ship app stage 1.** It needs nothing from the robot and makes the app worth opening on its own.

The ideas in [More to build](#more-to-build) slot in after these stages, as marked there.

Talk to a range early. Decisions 3, 5 and 6 all depend on a real range: how wide the bays are, what ball machine it has, whether it will give up end bays for a trial. A range that is interested before the robot works is worth more than a finished robot with nowhere to go.

## More to build

Ideas taken from Sweetspot, Toptracer and Japanese ranges (see [What Japan does](#what-japan-does)), placed where they fit. None comes before the robot's R1 and app stages 1 to 3. Those prove the part nobody else has, and everything below is easier to sell once the robot works.

**For players, in the app**

| # | Idea | Seen at | What RangeOps builds | Fits in |
| --- | --- | --- | --- | --- |
| 1 | One account across every RangeOps range | PLATTO GOLF | Accounts in stage 4 work across ranges from the start, so bookings, buckets and history follow the player | Stage 4 |
| 2 | Book clubs and lessons with the bay | PLATTO GOLF hires clubs; Sweetspot sells academy lessons | Add-ons to a bay booking, the same way as the robot | Stage 4 |
| 3 | Leaderboards and tournaments across ranges | GDO's Toptracer tournament across 142 Japanese ranges; Toptracer's app leaderboards | Weekly Shrink the Ring and Beat Your Best boards per range and nationally, with junior divisions | After stage 4 |
| 4 | **Fetch challenge**, a game only RangeOps can offer | Nowhere | Most balls fetched in two minutes, counted by the robot's optional gate sensor ([robot/README.md](../robot/README.md#subsystems)) | After R1 and stage 4 |
| 5 | Swing video with pose analysis | CONVER GOLF Lab's AI form checks in Japan | Film a swing on the phone. A pose model on the phone draws the body's lines and compares them with last week's. Needs no hardware. | Any time after stage 1 |
| 6 | Order food and drinks to the bay | Swing Factory Terrey Hills in Sydney takes orders by QR code | Order from the app; staff see the queue in the console | After stage 5 |

**For ranges, in the console**

| # | Idea | Seen at | What RangeOps builds | Fits in |
| --- | --- | --- | --- | --- |
| 7 | Price bays by time, with peak and off-peak, and demand pricing above a floor | Sweetspot | Prices per bay-hour set in the console. Demand pricing later, never below the range's minimum. | Stages 4 and 5 |
| 8 | Memberships, passes and ball credits | Sweetspot, Japanese IC cards | Prepaid buckets and monthly passes, held on the player's account | Stage 5 |
| 9 | Check in and unlock the bay | Sweetspot's locked and unlocked bays; Toptracer screens that unlock for a booking | A QR code at each bay starts the session and, if a robot was hired, issues its hire key | Stage 5 |
| 10 | A live view of the range | Toptracer pitched to Japanese ranges as a tool for running the business | Bays in use, robots out and their batteries, today's takings | Stage 5 |

**Hardware**

| # | Idea | Seen at | What RangeOps builds | Fits in |
| --- | --- | --- | --- | --- |
| 11 | A payment box for the range's existing ball machine | Japanese payment units retrofitted to ball machines | A small box with a QR reader that credits the machine when a player scans an app bucket code. Built from the same kind of controller as the robot. Wiring into a machine's coin or credit input needs that machine's maker or an electrician, and mains-powered gear needs electrical approval. | After decision 5, at the pilot range |
| 12 | A bay tablet | Toptracer's bay screens | A cheap tablet on a stand showing the target, the game and the leaderboard, so a range without tracking still feels like it has it | After stage 5 |
| 13 | Charging on the dock | Japanese and European picking robots return to base to charge | Contacts on the dock, so robots charge between hires and staff stop swapping batteries | After R2 |
| 14 | **Night shift** | Kiwa Sangyo M-one, ECHO, Husqvarna and Korechi pickers | After hours, the robots sweep the short zone in front of the bays on their own and bring the balls back to the dock | Much later. It needs the lane limit and positioning from R2 to be proven first, and driving with no one holding the stick is a new safety case. |

**Not building**, and why:

- **Automatic tee-up.** It's bay hardware, and makers like Nishino Seisakusho already sell it.
- **Whole-range pickers.** ECHO, Husqvarna, Toro, Korechi and Kiwa Sangyo already make them, at sizes far beyond Mulligan.
- **Shot tracking hardware.** Toptracer and TrackMan use years of camera and radar work. Tap-to-mark stays the answer for ranges without them, and those ranges' bays can still use the tablet in idea 12.

## What Japan does

Japan has some of the busiest and most automated driving ranges anywhere, because courses are scarce and expensive. What's already there, as of 2026:

| What | Japan | What it means for RangeOps |
| --- | --- | --- |
| Shot tracking on the bay screen | Toptracer Range, run in Japan by Golf Digest Online, is at 144 ranges and about 10,000 bays ([Yahoo! Japan](https://sports.yahoo.co.jp/column/detail/2026061100021-spnavido)). TrackMan Range is at about 100 ([digitalpr](https://digitalpr.jp/r/113972)), including ten Accordia Garden ranges ([PR TIMES](https://prtimes.jp/main/html/rd/p/000000024.000060101.html)). GDO runs a nationwide virtual tournament across 142 of them. | Games with leaderboards across ranges are expected. The tap-to-mark Games tab suits ranges with no tracking. |
| Booking and paying from a phone | Mitsubishi Estate's PLATTO GOLF lets you find a range, book a bay and clubs, and pay ahead, with one account across ranges. It started at two Tokyo ranges ([Payment Navi](https://paymentnavi.com/paymentnews/107683.html)). | The Book tab is the same idea. One account across ranges is worth copying. |
| Paying for balls | Payment units retrofitted to existing ball machines, so a card or IC card pays for balls ([Impress Watch](https://www.watch.impress.co.jp/docs/news/1334451.html)). | A cheaper route for decision 5 than replacing a range's machine. |
| Teeing up | Automatic tee-up in the bay is common, from makers like Nishino Seisakusho ([Ipros](https://pr.mono.ipros.com/nishino-ss/product/detail/2001616905/)). | Out of scope. It's bay hardware, not something RangeOps makes. |
| Collecting balls | Self-driving pickers that work while the range is open, such as Kiwa Sangyo's M-one ([Jidounten Lab](https://jidounten-lab.com/u_41148)). One Hamamatsu range named its two robots Kamekichi and Kametaro ([Forbes Japan](https://forbesjapan.com/articles/detail/66605)). | Robots on the field during opening hours are already accepted there. They are staff machines, not something a child drives. |

I found no robot a child drives from the bay in Japan either. One difference to plan for: many Japanese ranges are multi-storey and netted, so Mulligan would only work from ground-floor bays there.

## Risks

| Risk | Why it matters | What reduces it |
| --- | --- | --- |
| The pickup does not work on real turf | Wet grass, divots and balls half-buried are harder than a mat. Without reliable pickup there is no product. | Prototype it first, by hand, on the worst ground available. |
| The lane limit cannot be held | The safety promise is that the robot stays in front of its own bay. A bay is about three metres wide, and a three degree heading error is a metre and a half sideways at 30 m. | Measure odometry drift on R0. Budget for ultra-wideband. For the pilot, use end bays or leave a bay empty either side. |
| A ball strike injures the robot or ricochets | It works on a live range. | Low, sloped shell; strike tests in R3; the robot is hired with a bay so staff know when it is out. |
| iPhone cannot connect | Most families at a range will have one. | Decision 2. Prove the Capacitor path in app stage 3, before any range sees it. |
| Booking is a different product per range | Every range has its own tee sheet, tills and ball machine. | Build booking around the pilot range, not in the abstract. Until then it stays a demo. Keep it behind the boundary in [Built to swap](#built-to-swap), so a range on Sweetspot or its own system can keep that. |
| Selling a radio-controlled, battery-powered product | Radio and electrical compliance and lithium battery rules apply before units leave the workshop. | Use pre-certified radio modules and off-the-shelf battery packs with their own protection. Get advice before R3. |

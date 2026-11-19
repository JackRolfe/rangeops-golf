# Range console

Status: ready-for-agent

App stage 5 in [docs/PLAN.md](../../docs/PLAN.md), plus ideas 7, 8, 9 and 10 from "More to build": a web app for range staff, in `apps/console`.

## Problem

The pilot range has to run a day without asking us for anything. Staff need one screen to set the range up (bays, hours, prices), see who is coming today and what they paid for, hand over buckets against the codes players show them, sell and redeem passes and ball credits, print the QR code that sits at each bay, and see at a glance what is happening on the range: which bays are in use, where each robot is, and what the range has taken today.

The backend (`apps/api`) is being built at the same time on another branch. The console must not wait for it, and the plan says a partner's portal could stand in for the console's data source later ("Built to swap"). So the console talks to one typed interface, `ConsoleApi`, and every screen is built against an in-memory fake of it.

## Users

Range staff at the counter, on a laptop or a tablet in landscape. One range per console. No staff accounts yet: the console is opened on the range's own machine (sign-in arrives with the real API).

## Glossary

Terms the console uses. The backend should use the same words.

| Term | Meaning |
| --- | --- |
| **Range** | One driving range. Has a name, a timezone, a currency, bays, opening hours and a price list. |
| **Bay** | One hitting position, numbered from 1. Can be marked out of service. Has a price band. |
| **Price band** | `standard` or `premium`. Each band has its own per bay-hour prices. Premium is for covered or tracked bays. |
| **Bay-hour** | One bay for one clock hour, the unit a booking is priced in. |
| **Peak window** | A weekday and a span of hours where the peak price applies. Every other open hour is off-peak. |
| **Floor price** | The lowest a bay-hour may ever cost, per band. Peak and off-peak prices can't be set below it, and demand pricing (later) is clamped to it. |
| **Opening hours** | Per weekday, the hour the range opens and the hour it closes, or closed. Bookings must fall inside them. |
| **Booking** | A bay for a run of whole hours on a date, with an optional robot hire. Has a player name, a source (`app`, `counter` or `partner`), a status (`booked`, `checked-in`, `cancelled`) and what was paid. |
| **Robot hire** | A Mulligan robot hired with a booking, for the booking's hours. Priced per hour. |
| **Bucket** | A number of balls: small (40), medium (80) or large (120). |
| **Bucket code** | A six-character code (no 0, O, 1 or I) a player shows to get a bucket. Where it was paid for doesn't matter. |
| **Order** | A paid bucket. Has a bucket code and a status: `paid`, `handed-over` or `refunded`. |
| **Handover** | Staff enter or scan a code; the console checks it and marks the order handed over, once. |
| **Pass** | Held on a player's account. Either a **monthly pass** (a number of free bay-hours and buckets each calendar month, until an end date) or a **ball credit pack** (prepaid buckets that don't expire). |
| **Ball credit** | One prepaid bucket on a pass. Redeeming one hands over a bucket with no code. |
| **Check-in QR** | A code printed at each bay. Scanned by the app, it starts the session for that bay's booking and, if a robot was hired, issues the hire key. The console only shows and prints it. |
| **Robot state** | The telemetry states from the [control link](../../robot/README.md#control-link-draft): idle, driving, at-limit, link-lost, stopped, fault, low-battery, locked. Plus `docked` and `charging` from the fleet record. |
| **Takings** | Money the range took today: bay bookings, robot hires, buckets and passes, minus refunds. Counted when paid, not when used. |

## What it does

### Live view (home)

- Every bay as a tile: free, booked later, in use now (with the player and when they finish), or out of service.
- Every robot: name, state, battery (warn under 25%), and which bay it is hired to until when.
- Today's takings, split by bay bookings, robot hires, buckets and passes, and the total.
- Refreshes itself every few seconds.

### Today

- Today's bookings in time order: time, bay, player, hours, robot hire, source, status, amount. Staff can check a player in, or cancel.
- Today's orders: code, bucket, status, when paid, when handed over.
- A day picker to look at other days.

### Handover

- One input for a bucket code. Case, spaces and dashes don't matter.
- The result says clearly: hand over a medium bucket (80 balls); or already handed over at 10:42; or refunded; or no such code. A code is handed over at most once.
- The last few handovers below, so staff can see what they just did.

### Passes and ball credits

- List passes: player, kind, buckets left, bay-hours left this month, valid until.
- Sell a monthly pass or a credit pack at the counter (records a payment, so it shows in takings).
- Redeem a ball credit against a pass (hands over a bucket, no code).
- Monthly allowances reset on the 1st; a pass past its end date can't be redeemed.

### Check-in QR codes

- One QR code per bay, encoding the app's check-in link for this range and bay.
- Show one large on screen, or print a sheet of all bays, one card per bay with the bay number.

### Setup

- Bays: add, rename, set band, take out of service.
- Opening hours per weekday.
- Prices per band: off-peak and peak per bay-hour, floor; peak windows; robot hire per hour; bucket prices; pass prices.
- A price preview: pick a day, a start and a length, see each hour's price and the total.
- Saving refuses prices below the floor and windows outside opening hours.

## Boundary

`ConsoleApi` (in `apps/console/src/api/ConsoleApi.ts`) is the only way screens read or change data. Two implementations:

- `FakeConsoleApi`: in memory, seeded with a demo range of 20 bays and three robots and a busy day of bookings and orders. Robots drain and charge as time passes. Used by the app until the real API exists, and by tests.
- `HttpConsoleApi`: later, against the backend's OpenAPI file (ticket 11). A partner portal adapter would be a third.

All money is integer cents. Dates are local `YYYY-MM-DD` strings in the range's timezone; times are whole hours (0 to 24). The fake picks "today" from an injected clock.

## Not in scope

- Staff accounts and sign-in, roles.
- Demand pricing itself (only the floor it will respect).
- Taking card payments at the counter: counter sales are recorded as paid.
- Food and drink orders (idea 6), leaderboards, the bay tablet.
- Driving or commanding robots. The console only reads the fleet.

## Done when

- Every screen works against the fake.
- Vitest covers pricing by hour and peak, bucket code handover, passes and takings.
- A Playwright smoke test opens each screen.
- `npm run build` passes in `apps/console`.
- Each ticket is a local commit on this branch.

# Spec: RangeOps backend (`apps/api`)

Status: ready-for-agent

## Why

App stage 4 (Book and Balls) is the first part of RangeOps that needs accounts, money and a server. The range console (stage 5) needs the same server to set up bays and prices, see the day's bookings and hand over buckets. And the robot only drives for a phone holding a signed hire key, which only a backend can issue. See [docs/PLAN.md](../../docs/PLAN.md): app stage 4, decision 4, "Built to swap", and ideas 1, 2, 7, 8 and 9 in "More to build".

This spec is for a backend that runs entirely on one machine: no host, no real email, no real payments. Choosing a host and wiring Stripe come later and must not change the API.

## What it is

A TypeScript HTTP API in `apps/api`, on Node 22, started with `npm run dev` on port 8787. Self-contained: its own `package.json` and lockfile, not in the root workspaces yet.

- **Stack** ([ADR 0001](../../docs/adr/0001-backend-stack-for-local-api.md)): Hono with `@hono/zod-openapi`, PGlite (Postgres compiled to WASM, in-process), Vitest.
- **Database**: Postgres SQL, run by PGlite. On disk at `apps/api/.data/` in dev (gitignored), in memory in tests. Plain SQL migrations in `src/db/migrations/`, applied in order at start-up.
- **OpenAPI**: generated from the route definitions and committed as `apps/api/openapi.json`. A test fails if the committed file differs from what the routes produce, so the file always matches.
- **Seed**: on first start the dev database gets one demo range (see [Demo data](#demo-data)).

## Who calls it

| Caller | What for |
| --- | --- |
| The RangeOps app (`apps/player`) | Sign in, see ranges and free bays, book, buy balls, passes and credits, check in at a bay, get the hire link |
| The range console (`apps/console`) | Set up bays, hours and prices; see today's bookings and orders; redeem bucket codes; see the fleet |
| Another booking source (a range's own system, later perhaps a partner) | Hand in a booking it took, so a robot add-on still becomes a hire key |

## Rules

1. **The backend only knows about hires, not driving.** It records which robot is hired to which bay for which hour and signs a key for it. It never talks to a robot.
2. **Practice data never comes here.** Accounts add bookings and purchases; games and history stay on the phone.
3. **One account across every range** (idea 1). An account is not tied to a range. Bookings, orders, passes and credits each name their range, and `/me/...` lists them across all ranges.
4. **Money is integer cents** in the range's currency (`AUD` for the demo; decision 6 is still open).
5. **Each piece sits behind one boundary** (Built to swap):
   - *Booking and payment*: bookings can arrive from any source (`source: "rangeops"` from the app, `"external"` from the console or another system). Every robot add-on turns into a hire and a key the same way, whatever the source.
   - *Payments*: one `PaymentProvider` interface. Only a fake exists now.
   - *Balls*: a bucket is a code; redeeming it doesn't care how it was paid for.
   - *Console*: robot status comes from one fleet endpoint that anything with access to the range can read.
6. **Times**: the API speaks ISO 8601 instants. Ranges have an IANA time zone (`Australia/Sydney`) and opening hours, peak windows and "today" are in that zone. Bays are booked in whole hours, starting on the hour.

## Records

| Record | Holds |
| --- | --- |
| Range | Name, slug, time zone, currency, off-peak and peak price per bay-hour |
| Bay | Range, number (1 to 255; it goes into the hire key's single byte), name, active flag, check-in code (the QR code's secret) |
| Opening hours | Range, weekday, opens, closes (local time). A missing weekday means closed. |
| Peak window | Range, weekday, from, to (local time). Hours that start inside a window cost the peak price. |
| Bay price override | Optional off-peak and peak price on a bay, which beats the range's |
| Add-on price | Range, kind (`robot`, `club_hire`, `lesson`), price, unit (`per_hour` or `per_booking`) |
| Account | Email (unique, lower-cased), name, created at |
| Sign-in link | Account email, token hash, expiry, used at |
| Session | Account, token hash, expiry |
| Range staff | Account, range. Staff can use the console endpoints for that range. |
| Booking | Range, bay, account (null for an external booking with no RangeOps account), source, external reference, starts at, ends at, status (`pending_payment`, `confirmed`, `cancelled`), checked in at, price |
| Booking add-on | Booking, kind, quantity, price |
| Order | Account, range, kind (`booking`, `bucket`, `pass`, `ball_credit`), total, status (`pending`, `paid`, `failed`, `refunded`), payment provider and charge id |
| Order line | Order, description, quantity, unit price |
| Bucket product | Range, name, balls, price |
| Bucket code | Range, order, account, bucket product, code, redeemed at, redeemed by |
| Pass product | Range, kind (`monthly_pass` or `ball_credit`), name, price, days valid (passes), discount percent (passes), balls (ball credit packs) |
| Pass | Account, range, pass product, valid from, valid to |
| Ball credit entry | Account, range, balls (positive bought, negative spent), reason, order or bucket code |
| Robot | Range, serial (4 characters, as in its advertised name), name, home bay, in service flag, last reported state, battery, balls on board, firmware, last seen at |
| Hire | Robot, booking, bay number, starts at, ends at, status (`active`, `cancelled`), the 78-byte key |

## Behaviour

### Accounts by email link

- `POST /auth/email-link {email}` makes a single-use token valid for 15 minutes and "sends" `APP_URL/signin?token=…` by writing it to the console log. Always answers 202, so it doesn't reveal which emails have accounts.
- `POST /auth/verify {token}` signs in: creates the account on first use, returns a session token valid for 30 days. Later requests send `Authorization: Bearer <token>`.
- `GET /me` returns the account and the ranges it is staff at. `POST /auth/sign-out` ends the session.
- Tokens are random 32 bytes, base64url. Only their SHA-256 is stored.
- Mail goes through a `Mailer` interface; the only implementation logs to the console. Tests capture it.

### Ranges, prices and availability

- `GET /ranges` and `GET /ranges/{rangeId}` are public: bays, hours, peak windows, prices, add-ons, bucket and pass products.
- `GET /ranges/{rangeId}/availability?date=YYYY-MM-DD` lists, for each active bay, each open hour that day (local time) with its price, whether it is peak, and whether it is free. It also says how many robots are free in each hour.
- Price of an hour on a bay: the bay's override if set, else the range's; peak if the hour starts inside a peak window for that weekday, else off-peak (idea 7). Demand pricing is not built; when it is, it may never go below the off-peak price.

### Booking a bay (with add-ons)

`POST /bookings {bayId, startsAt, hours (1–4), addOns: [{kind, quantity?}], paymentMethod}`, signed in.

1. Refuse with 422 if: the start isn't on the hour, it's in the past, any hour falls outside opening hours, the bay is inactive, or an add-on kind is unknown.
2. Refuse with 409 if the bay already has a confirmed or pending booking overlapping the time, or a robot was asked for and none is free for the whole time.
3. Price it: bay hours + add-ons (robot per hour, club hire per booking per set, lesson per booking), minus an active pass's discount on the bay hours.
4. Charge through the payment provider. On decline: the booking is `cancelled`, the order `failed`, and the answer is 402.
5. On success: booking `confirmed`, order `paid`. With a robot add-on, assign a free robot (preferring one whose home is that bay), create a hire for the booking's time and sign its hire key.
6. Answer 201 with the booking, its add-ons, the order and, with a robot, the hire (robot, serial, times, key and hire link).

Lessons (idea 2) are an add-on with a price; matching a coach to the slot is the range's job for now and not modelled.

`GET /me/bookings` lists the account's bookings across ranges, newest first. `GET /bookings/{bookingId}` shows one (owner or that range's staff). `POST /bookings/{bookingId}/cancel` (owner, before it starts; or staff any time) cancels it, refunds the order and cancels the hire. A hire key already on a phone can't be recalled, because the robot checks keys offline; a cancelled hire's robot is free to hire again, and staff can see that in the fleet.

### Hire keys

The exact 78-byte layout in [robot/README.md](../../robot/README.md#control-link-draft):

| Bytes | Meaning |
| --- | --- |
| 0 | Version, 1 |
| 1–4 | Robot serial, 4 ASCII characters |
| 5–8 | Hire start, Unix seconds, uint32 little-endian |
| 9–12 | Hire end, the same |
| 13 | Bay number |
| 14–77 | Ed25519 signature over bytes 0–13 |

- Signed with Node's built-in `crypto` (Ed25519). The private key is a PKCS#8 PEM at `apps/api/.keys/hire-signing-key.pem` (gitignored, created on first start if missing; path overridable with `HIRE_SIGNING_KEY_PATH`). Tests use a key made in memory.
- `GET /hire-keys/public-key` returns the raw 32-byte public key as hex and base64, for flashing into firmware.
- The key travels to the phone in a link: `APP_URL/drive?hire=<base64url of the 78 bytes>`. The API also returns the key as hex and base64url.
- The key covers exactly the booked hours. No early start: check-in early still gives a key that starts at the booking time.

### Check-in at the bay (idea 9)

Each bay has a check-in code, a random token printed as a QR code that opens `APP_URL/check-in/<code>`. The app then calls `POST /check-in/{code}`, signed in.

- Finds the account's confirmed booking at that bay that is running now or starts within 15 minutes.
- Marks it checked in (once; repeating is harmless) and answers with the booking, the bay and, if a robot was hired, the hire with its key and link.
- 404 if the code is unknown; 404 with `no_booking` if the account has no booking at that bay now.
- Staff can read a bay's code (and rotate it) from the console endpoints.

"Unlocking" a bay is just this record for now; there is no hardware to unlock.

### Balls, passes and ball credit (idea 8)

- `POST /orders/buckets {rangeId, bucketProductId, payWith}` where `payWith` is `{method: "card", paymentMethod}` or `{method: "ball_credit"}`. Card: charge (with an active pass's discount). Credit: spend the bucket's balls from the account's credit at that range, 409 if short. Either way, answer 201 with the order and a bucket code.
- Bucket codes are 8 characters from an unambiguous alphabet, shown as `XXXX-XXXX`, unique per range.
- `POST /orders/passes {rangeId, passProductId, paymentMethod}` buys a monthly pass (valid from now for its days; buying another extends from the current one's end) or a ball credit pack (adds its balls to the account's credit at that range).
- `GET /me/wallet` lists active passes, ball credit per range, and unredeemed bucket codes. `GET /me/orders` lists orders.
- Staff redeem a code: `POST /ranges/{rangeId}/bucket-codes/{code}/redeem`. 404 unknown, 409 already redeemed (with when).

### Fleet

- `GET /ranges/{rangeId}/fleet` (that range's staff): each robot with serial, name, home bay, in service, last reported state, battery, balls, last seen, and its current or next hire today (bay, times, booking). The console reads it; a partner portal could read the same thing later.
- `POST /robots/{robotId}/status {state, batteryPct, ballsOnBoard?, firmware?}` records the latest telemetry. Staff may post it, and so may the account holding the robot's current hire, so the phone driving it can relay what the robot reports. States are the telemetry state names from the control link.
- Staff manage robots: `POST /ranges/{rangeId}/robots`, `PATCH /robots/{robotId}`.

### Console set-up and views

Staff of a range can:

- `PATCH /ranges/{rangeId}`: name, prices.
- `PUT /ranges/{rangeId}/hours` and `PUT /ranges/{rangeId}/peak-windows`: replace the week.
- `POST /ranges/{rangeId}/bays`, `PATCH /bays/{bayId}`, `POST /bays/{bayId}/check-in-code` (rotate).
- `GET /ranges/{rangeId}/bookings?date=` and `GET /ranges/{rangeId}/orders?date=`: the day's bookings and orders.
- `POST /ranges/{rangeId}/external-bookings {bayId, startsAt, hours, addOns, externalRef, customerName?}`: record a booking taken elsewhere. No payment is taken; it is confirmed at once, and a robot add-on becomes a hire key the same way. The answer carries the hire link, so staff can hand it on.

### Payments

```ts
interface PaymentProvider {
  readonly name: string;
  charge(req: { amountCents; currency; description; paymentMethod; idempotencyKey }): Promise<{ ok: true; chargeId } | { ok: false; reason }>;
  refund(req: { chargeId; amountCents }): Promise<{ ok: true } | { ok: false; reason }>;
}
```

The fake provider succeeds for `pm_fake_ok` and declines `pm_fake_declined`, like a card processor's test cards, and makes no network calls. Setting `FAKE_PAYMENTS=decline` declines everything. A zero total skips the charge.

### Errors

Every error is `{error: {code, message}}` with a fitting status: 400 bad input (schema), 401 not signed in, 403 not allowed, 404, 409 conflict, 402 payment declined, 422 a rule was broken.

## Demo data

One range, "RangeOps Demo Range", slug `demo`, in `Australia/Sydney`, `AUD`:

- 8 bays, numbered 1–8. Open 07:00–22:00 every day.
- Off-peak $18 a bay-hour, peak $28. Peak: weekdays 16:00–21:00, weekends 08:00–14:00.
- Add-ons: robot $15 an hour, club hire $10 a set, lesson $70.
- Buckets: small 50 balls $10, medium 100 balls $18, large 150 balls $24.
- Passes: monthly pass $49 for 30 days at 10% off bays and buckets; ball credit 500 balls for $80.
- Robots: Mulligan `A1B2` at bay 1 and `C3D4` at bay 2.
- Staff account `staff@rangeops.test`.

## Testing

Vitest. API tests call the Hono app directly (`app.request`), each against a fresh in-memory PGlite database, with a fixed clock, the fake payment provider, a captured mailer and an in-memory signing key. Unit tests for the hire key layout, pricing and time-zone maths.

## Out of scope

Real email, Stripe, hosting, demand pricing, coach scheduling, food orders, the range map upload, leaderboards, refunds of bucket orders, revoking a hire key on a robot, a partner API key (a partner reading the fleet would need one; for now only staff can), rate limiting.

## Done when

`npm run dev` serves the API on 8787 with the demo range; `npm test` passes; `openapi.json` matches the routes; each ticket under `.scratch/backend-api/issues/` is a local commit on this branch.

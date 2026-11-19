# 11 Point the console at the real API

Status: resolved
Type: task
Blocked by: the backend's OpenAPI file in `apps/api` (on its own branch, not merged)

Write `HttpConsoleApi implements ConsoleApi` against the backend's OpenAPI file, and choose it over the fake with an env var (`VITE_CONSOLE_API=http://...`; unset keeps the fake). Map the backend's shapes onto the console's types in the adapter only; screens must not change. Where the backend names a concept differently from the spec's glossary, raise it rather than renaming silently.

Robot status should come from the one fleet endpoint, so a partner's portal could read the same thing ("Built to swap" in docs/PLAN.md).

Needs: the OpenAPI file merged into this branch, and a decision on how staff sign in.

## Acceptance

- The contract tests the fake passes (`src/api/consoleApi.contract.ts`) also pass against a running local API.

## Comments

- The fake and every screen are done (tickets 01 to 10). This is the only open console ticket. The backend branch `feature/backend-api-7a8320` has its own ADRs (0010 backend stack, 0011 hire-key signing); read them and its OpenAPI file when it lands. See also `docs/adr/0020-console-reads-and-writes-through-one-consoleapi.md`.
- 2026-11-19, resolved. `src/api/http/HttpConsoleApi.ts` implements `ConsoleApi` against `apps/api`. Set `VITE_CONSOLE_API` (or run `npm run dev:api`) to use it; unset, the fake stays the default and the tests use it. Staff sign in with the API's email link (`src/components/SignIn.tsx`). The contract passes against a running, seeded API (`HttpConsoleApi.live.test.ts`), and every screen was clicked through against it.
- The API changes the console needed, each with tests: staff check-in (`POST /bookings/{id}/check-in`), bucket codes in the day's orders (`StaffOrder.bucketCode`), a staff list of passes and ball credit (`GET /ranges/{id}/passes`), a floor price on the range (`floorCentsPerHour`, 422 `below_floor`), and `SEED_DEMO_DAY=1` / `npm run dev:demo` to fill today with demo data. CORS was already open.

### Where the two models differ (the API wins; decisions for later)

| Console spec | API | What the console does now |
| --- | --- | --- |
| Two price bands, each with a floor | A range price, optional per-bay prices, one floor | A bay with its own prices shows as premium; saving gives premium bays the premium band's prices. Two different band floors are refused. |
| Monthly pass = buckets and bay-hours each month | Monthly pass = a percent off for N days | Passes show what they give in words. Allowance fields are hidden for API passes. |
| Credit pack = prepaid buckets | Ball credit = balls | Shown as balls of credit. |
| Staff sell passes and redeem credit at the counter | Passes are bought by the player in the app only | `capabilities.sellPasses/redeemPasses` are false; the screen says so. Needs an API counter-sale endpoint to switch on. |
| Staff set robot, bucket and pass prices | No endpoint to change products | Shown read-only (`capabilities.editProducts`). |
| Bucket sizes small/medium/large, 6-character codes | Named bucket products, 8-character codes (`ABCD-EFGH`) | Sizes by ball count order; the API normalises and checks codes. |
| Booking source app / counter / partner | `rangeops` / `external` | `external` shows as partner. |
| Player name | Account email, or `customerName` for external bookings | App bookings show the email: the API's day bookings don't include the account's name. |
| Static check-in link from the public app URL | A secret code per bay: `APP_URL/check-in/<code>` | The QR encodes the API's link; the URL is read-only. |
| Takings counted when paid, refunds on the day given | Day orders are listed by the day they were made | A refund today of an order from an earlier day isn't counted yet. |

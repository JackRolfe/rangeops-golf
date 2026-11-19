# RangeOps console

The staff web app for a range: bays, hours and prices; today's bookings and orders; bucket handover; passes and ball credits; bay check-in QR codes; and a live view of the range. App stage 5 in [docs/PLAN.md](../../docs/PLAN.md). The spec and tickets are in [.scratch/range-console](../../.scratch/range-console/spec.md).

It is self-contained for now (its own lockfile, not in the root workspaces), so install and run it from this folder:

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # Vitest: domain logic and the fake API
npm run build
npm run test:e2e   # Playwright smoke test against vite preview of the build
```

Every screen reads and writes through `ConsoleApi` (`src/api/ConsoleApi.ts`). By default that is `FakeConsoleApi`, an in-memory demo range that resets on reload; the tests use it.

## Against the RangeOps API

`HttpConsoleApi` (`src/api/http/`) runs the console against `apps/api`:

```bash
cd ../api && npm run dev:demo     # API on :8787, with today filled with demo data
cd ../console && npm run dev:api  # console on :5174, pointed at it
```

Sign in as `staff@rangeops.test`. Running locally, the API prints the sign-in link in its log; paste it into the console. Set `VITE_CONSOLE_RANGE` to a range's slug or id if the account runs more than one.

`npm test` checks the adapter against canned API answers and checks `../api/openapi.json` still has every path it calls. To run the ConsoleApi contract against a running API (it changes data, so use a local one):

```bash
CONSOLE_API_URL=http://localhost:8787 CONSOLE_API_TOKEN=<staff session token> npx vitest run src/api/http/HttpConsoleApi.live.test.ts
```

Where the API's model differs from the console's (passes, price bands, product prices), the API wins and the console hides what it can't do: see ticket 11.

Add `?now=2026-11-19T17:10` before the `#` to start the demo clock at a given local time, for demos out of hours: `http://localhost:5174/?now=2026-11-19T17:10#/live`. The smoke test uses this.

Playwright is pinned to the same version as `apps/player` so both use the browsers already installed.

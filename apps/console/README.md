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

Every screen reads and writes through `ConsoleApi` (`src/api/ConsoleApi.ts`). Today that is `FakeConsoleApi`, an in-memory demo range that resets on reload. Pointing it at the real backend is ticket 11.

Add `?now=2026-11-19T17:10` before the `#` to start the demo clock at a given local time, for demos out of hours: `http://localhost:5174/?now=2026-11-19T17:10#/live`. The smoke test uses this.

Playwright is pinned to the same version as `apps/player` so both use the browsers already installed. `.npmrc` sets `legacy-peer-deps`, because npm 10 crashes resolving vitest's optional peers here.

# RangeOps console

The staff web app for a range: bays, hours and prices; today's bookings and orders; bucket handover; passes and ball credits; bay check-in QR codes; and a live view of the range. App stage 5 in [docs/PLAN.md](../../docs/PLAN.md). The spec and tickets are in [.scratch/range-console](../../.scratch/range-console/spec.md).

It is self-contained for now (its own lockfile, not in the root workspaces), so install and run it from this folder:

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # Vitest: domain logic and the fake API
npm run test:e2e   # Playwright smoke test against vite preview
npm run build
```

Every screen reads and writes through `ConsoleApi` (`src/api/ConsoleApi.ts`). Today that is `FakeConsoleApi`, an in-memory demo range that resets on reload. Pointing it at the real backend is ticket 11.

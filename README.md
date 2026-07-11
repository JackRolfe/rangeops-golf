# RangeOps

RangeOps is a mobile-first, offline-capable driving-range practice tracker. Upload an aerial image of your range, set a visual target, tap each landing point, and review your accuracy over time.

## Run locally

```bash
npm install
npm run dev
```

Production checks:

```bash
npm test
npm run build
npm run test:e2e
```

## Local data

The range image, drafts, completed sessions, and preferences are stored in IndexedDB in the current browser profile. The app has no server, account, analytics, or cloud sync. Clearing site data removes the stored history.

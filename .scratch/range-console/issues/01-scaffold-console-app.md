# 01 Scaffold apps/console

Status: ready-for-agent
Type: task
Blocked by: none

A React + Vite + TypeScript app in `apps/console`, self-contained (own `package.json` and lockfile, not in the root workspaces yet). Uses `@rangeops/brand` through a `file:` dependency for colours and type, and the same fonts as `apps/player`. Dev server on port 5174.

A shell with a side navigation (Live, Today, Handover, Passes, Check-in QR, Setup) and hash routes (`#/live` and so on), so each screen has a URL. Screens can be placeholders.

## Acceptance

- `npm run dev` serves on 5174; `npm run build` and `npm test` pass.
- The nav reaches every route.

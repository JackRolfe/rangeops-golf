# 07. Playwright against a local API, and the root checks

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 04, 05, 06

## What

`playwright.api.config.ts` starts the API (fresh data folder, log to a file) and an app build pointed at it. One flow: sign in from the logged link, book a bay with a robot, open Drive from the booking, buy a bucket and see its code, check in from the bay's QR link. Root `npm test`, `npm run typecheck` and `npm run build` pass.

## Acceptance

- [ ] `npm run test:e2e:api -w @rangeops/player` passes.

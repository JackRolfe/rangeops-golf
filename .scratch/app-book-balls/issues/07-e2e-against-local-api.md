# 07. Playwright against a local API, and the root checks

Status: resolved
Spec: ../spec.md
Blocked by: 04, 05, 06

## What

`playwright.api.config.ts` starts the API (fresh data folder, log to a file) and an app build pointed at it. One flow: sign in from the logged link, book a bay with a robot, open Drive from the booking, buy a bucket and see its code, check in from the bay's QR link. Root `npm test`, `npm run typecheck` and `npm run build` pass.

## Acceptance

- [x] `npm run test:e2e:api -w @rangeops/player` passes.

## Comments

Done. `npm run test:e2e:api -w @rangeops/player` starts a fresh API (data in the system temp folder, output to a log the test reads links from) and an app build at /app/ pointed at it. The flow covers sign-in by link, booking with a robot, Drive refusing tomorrow's real Ed25519 key as not yet started, a bucket and its code, a bay QR check-in (no booking now, so the API's message), and a hire link from the API. A check-in that succeeds needs a booking within 15 minutes of the API's clock, which a test can't arrange, so it is covered against the fake in `CheckInScreen.test.tsx`. Root `npm test`, `npm run typecheck` and `npm run build` pass. Running the old Playwright suite repeatedly showed the Drive flow flaking: at full stick a 1% sideways wobble sets the firmware's speed flag (state 2), and the message flipped. A speed-only limit now reads the same as driving.

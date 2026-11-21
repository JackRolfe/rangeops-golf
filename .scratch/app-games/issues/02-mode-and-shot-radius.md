# 02. Session mode, per-shot ring radius, database version 2

Status: resolved
Spec: ../spec.md
Blocked by: 01

## What

- `PracticeSession.mode: GameMode`; `Shot.radius: number` (same units as `Target.radius`).
- `createSession` takes an optional `mode` (default `bullseye`).
- `addShot` computes `radius` with `ringForNextShot`, using the session's range revision dimensions, inside its transaction.
- `RANGEOPS_DB_VERSION = 2`. The upgrade from 1 walks every session, sets `mode: 'bullseye'` where missing and back-fills each shot's `radius` from `session.target.radius`. Ranges and preferences are untouched.
- Metrics judge each shot against its own radius (`shotTarget`). `RangeMapCanvas` colours each shot the same way.

## Acceptance

- [x] A test builds a real version-1 database (range, preferences, a completed session and a draft with shots), opens it with the app, and finds every session, shot, note, range image and preference intact, with `mode` and `radius` filled in, and the same accuracy as before.
- [x] `addShot` in a `shrink` session stores the shrunken radius after three hits in a row; undo then add gives the same radius again.
- [x] Existing db and metrics tests still pass.

## Comments

Done. `RANGEOPS_DB_VERSION` is 2; `backfillGames` runs in the upgrade transaction. `normalizeSession` also fills `mode` and `radius` on read, as a second guard. The game can only change before recording starts, like the target. Migration tests: 'upgrading from schema version 1' in `src/data/db.test.ts`.

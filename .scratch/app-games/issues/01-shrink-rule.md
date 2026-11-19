# 01. Shrink the Ring rule in the domain

Status: resolved
Spec: ../spec.md
Blocked by: none

## What

Port the rule in `replay()` (`apps/site/index.html`) into `apps/player/src/domain/games.ts`:

- `GameMode = 'bullseye' | 'shrink'`.
- `playRing(mode, startRadius, hits)` replays a list of on-target/miss results and returns the ring radius for the next shot, the current streak and the on-target count.
- In `shrink`, every third on-target shot in a row multiplies the radius by 0.8, never below `startRadius / 3`. A miss resets the streak. In `bullseye` the radius never changes.
- `ringForNextShot(session, dimensions)` judges each recorded shot against its own radius and returns the ring for the next shot.

## Acceptance

- [x] Unit tests cover: bullseye never shrinks; 3, 6 and 9 hits in a row shrink once, twice, three times; a miss resets the streak; the floor holds after many hits; the demo's numbers (36 to 12) come out the same.

## Comments

Done in `apps/player/src/domain/games.ts` with tests in `games.test.ts`. Also added `shotTarget`, which ticket 02 uses for metrics.

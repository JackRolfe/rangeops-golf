# 05. Beat Your Best

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 02, 03

## What

- `getBestSession(sessions, ranges, { club, mode, excludeSessionId? })` in `domain/metrics.ts`: the completed session with the highest accuracy for that club and game, with at least `MIN_SHOTS_FOR_BEST` (5) shots; ties go to the earlier one.
- Games home: "Beat your best" card for the last-used club and each game: "Best with 7 iron: 70%. Beat it." or "Play 5 shots to set a best."
- Practice footer shows the best to beat for the session's club and game.
- Session detail says "New best!" when the finished session beats the previous best.

## Acceptance

- [ ] Unit tests: club filter is case-insensitive, mode filter, minimum shots, ties, exclude.
- [ ] Component test for the detail "New best!" message.

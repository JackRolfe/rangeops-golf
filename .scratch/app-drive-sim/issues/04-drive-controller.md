# 04. Drive controller: the app-side link rules

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 03

## What

`apps/player/src/robot/DriveController.ts`: takes a `RobotLink`. `hold(x, y)` with the stick in -1..1 (forward positive) sends at once and then 20 times a second; `release()` sends three zero messages with the thumb flag clear, 50 ms apart, then stops; `dispose()` releases. Sequence numbers count up and wrap at 255.

## Acceptance

- [ ] Fake-timer tests for rate, wrap, values rounded and clamped to -100..100, release, and that nothing is sent after release.
- [ ] With `SimulatedRobot`, the robot stops on release and never reports link lost.

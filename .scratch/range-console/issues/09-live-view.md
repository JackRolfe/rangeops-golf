# 09 Live view and today's takings

Status: ready-for-agent
Type: task
Blocked by: 02

`src/domain/takings.ts` sums today's payments by kind minus refunds. `src/domain/live.ts` works out each bay's state at a moment (free, booked later, in use, out of service). The Live screen shows bay tiles, robots (state, battery with a low warning, hired bay and until when) and takings, refreshing every 5 seconds. The fake drains hired robots' batteries and charges docked ones as its clock moves.

## Acceptance

- Vitest: takings by kind with a refund, bay state at a time, robot battery over time in the fake.

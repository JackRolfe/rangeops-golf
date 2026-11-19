# 02 ConsoleApi interface and in-memory fake

Status: ready-for-agent
Type: task
Blocked by: 01, 03

Define the domain types and `ConsoleApi` from the spec's glossary. Write `FakeConsoleApi` with an injected clock, seeded with a demo range: 20 bays (bays 1 to 4 premium), three robots, opening hours 7 to 22 (weekends 6 to 22), and a believable day of bookings, orders, passes and payments for "today". Provide it to screens through a React context.

## Acceptance

- Tests: the seed has 20 bays and 3 robots; reads return copies, so screens can't mutate the store by accident.

## Comments

- Now blocked by 03 as well: the seed prices its bookings with the pricing rules, so pricing lands first.

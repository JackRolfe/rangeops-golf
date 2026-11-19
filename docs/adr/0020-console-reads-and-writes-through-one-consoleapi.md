# 0020. The console reads and writes only through one ConsoleApi

Status: accepted, 2026-11-19

## Context

The range console (`apps/console`, app stage 5) was built while the backend (`apps/api`) was being built on another branch, with no API to call yet. The plan's "Built to swap" table also says a partner's portal could stand in for the console's data source, and that robot status comes from one fleet API a partner could read too.

## Decision

Every screen talks to one typed interface, `ConsoleApi` (`apps/console/src/api/ConsoleApi.ts`), and nothing else. Its words follow the console glossary in `.scratch/range-console/spec.md`. Rules (pricing, bucket handover, passes, takings, bay state) are pure functions in `apps/console/src/domain`, so a fake, the backend and the screens can all apply the same ones.

Until the backend is merged, `FakeConsoleApi` implements it in memory, seeded with a demo range (20 bays, three robots). A contract suite (`consoleApi.contract.ts`) states what any implementation must do; the fake passes it, and the HTTP adapter (ticket 11) must pass it against a running API.

Money is integer cents; dates and times are the range's local `YYYY-MM-DD` and `YYYY-MM-DDTHH:mm`. The console assumes it runs in the range's timezone.

## Consequences

- Screens never change when the data source does: the backend adapter, or a partner portal adapter, maps shapes onto the console's types in one place.
- Where the backend names something differently, the adapter maps it and the difference is raised, not silently renamed.
- ADR numbers 0020 and up are the console's, to avoid colliding with other branches' ADRs (firmware uses 0001 up, the backend 0010 up). Renumber on merge if needed.

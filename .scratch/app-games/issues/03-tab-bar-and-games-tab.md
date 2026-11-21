# 03. Tab bar and the Games tab

Status: resolved
Spec: ../spec.md
Blocked by: none

## What

- Replace `BottomNav` (Home, Practice, History) with a `TabBar` driven by a list of tabs. Stage 1 tabs: Games, Settings.
- Games home (was Home): range name, draft rail, game cards to start a session, recent accuracy ring and chart, recent sessions, "View all" to Progress.
- Progress (was History) is a view inside Games with a back button; the tab bar shows Games selected.
- Settings becomes the Settings tab (no back button needed; the tab bar is there).
- The practice and session detail screens stay full screen without the tab bar.
- Update `e2e/core-flow.spec.ts` for the new navigation.

## Acceptance

- [x] Component test: tab bar marks the current tab and switches tabs.
- [x] Typecheck and existing tests pass; Playwright core flow updated.

## Comments

Done. `BottomNav` became `TabBar` (tabs from a list, `--tab-count` sets the grid). Home became `GamesScreen`, History became `ProgressScreen` with a back button. 'View all' now shows once there is one completed session, so Progress is always reachable. Playwright run is in ticket 04.

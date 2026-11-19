# 02. Links and the five tabs

Status: resolved
Spec: ../spec.md
Blocked by: 01

## What

`routes.ts`: `parseLink(pathname, search, base)` gives `signin` (token), `drive` (hire key bytes), `check-in` (code) or `home`. Tabs: Games, Drive, Book, Balls, Settings. Range-map set-up moves inside Games, so the other tabs work without a map. Book and Balls get placeholder screens until tickets 04 and 05.

## Acceptance

- [x] Unit tests for the router, with base `/`, `/app/` and the dev `app/` prefix; bad hire keys are rejected.
- [x] The existing Playwright flows still pass.

## Comments

Done. `src/routes.ts` parses links; the app clears the address bar after reading one. Tabs: Games, Drive, Book, Balls, Settings. Set-up of the range map shows inside the Games tab with the tab bar, so Drive, Book, Balls and Settings work before it. `TabScreen` is the shared tab layout.

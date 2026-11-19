# 08 Bay check-in QR codes

Status: resolved
Type: task
Blocked by: 02

Each bay's check-in link is built from the range's public app URL, range id and bay id (`src/domain/checkIn.ts`). The Check-in screen shows one bay's QR large and prints a sheet of all bays (print stylesheet: one card per bay, nav hidden).

The public app URL is a range setting, defaulting to a placeholder until decision 7 (domain) is made.

## Acceptance

- Vitest: the link for a bay.
- Screen: a QR renders for every in-service bay; Print opens the print dialog.

## Comments

- Decided: the link is `<publicAppUrl>check-in?range=<rangeId>&bay=<bayId>`, for example `https://rangeops.example/app/check-in?range=demo-range&bay=bay-7`. It is static and printed once, so it carries no secret; the player's own booking in the app is what starts the session and gets the hire key. The player app needs a `check-in` route that reads these two parameters (not built here). The default public app URL is a placeholder until decision 7 picks a domain.

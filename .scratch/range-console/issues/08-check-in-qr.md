# 08 Bay check-in QR codes

Status: ready-for-agent
Type: task
Blocked by: 02

Each bay's check-in link is built from the range's public app URL, range id and bay id (`src/domain/checkIn.ts`). The Check-in screen shows one bay's QR large and prints a sheet of all bays (print stylesheet: one card per bay, nav hidden).

The public app URL is a range setting, defaulting to a placeholder until decision 7 (domain) is made.

## Acceptance

- Vitest: the link for a bay.
- Screen: a QR renders for every in-service bay; Print opens the print dialog.

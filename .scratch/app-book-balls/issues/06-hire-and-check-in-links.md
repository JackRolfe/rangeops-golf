# 06. Hire links and check-in

Status: resolved
Spec: ../spec.md
Blocked by: 02, 03, 04

## What

`/drive?hire=` opens Drive with that key. The simulator takes the key's serial and checks it with the verifier the API provides (`GET /hire-keys/public-key` for HTTP, the bench verifier for the fake). `/check-in/<code>` posts the check-in (signing in first if needed) and shows the bay, with a Drive button when a robot was hired.

## Acceptance

- [x] Tests: a hire key from the fake drives the simulator; a key for another time is refused with the right message; check-in shows the bay and the Drive button; an unknown code says so.

## Comments

Done. `DriveScreen` takes a `hire`; the simulator poses as the key's robot and checks it with `api.hireKeyVerifier()` (Ed25519 against `/hire-keys/public-key` when live, bench with the fake). `CheckInScreen` checks in as soon as there's a session. A code scanned signed out is kept 30 minutes in localStorage, so it carries on after a sign-in link opens in a new tab.

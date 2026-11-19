# 06. Hire links and check-in

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 02, 03, 04

## What

`/drive?hire=` opens Drive with that key. The simulator takes the key's serial and checks it with the verifier the API provides (`GET /hire-keys/public-key` for HTTP, the bench verifier for the fake). `/check-in/<code>` posts the check-in (signing in first if needed) and shows the bay, with a Drive button when a robot was hired.

## Acceptance

- [ ] Tests: a hire key from the fake drives the simulator; a key for another time is refused with the right message; check-in shows the bay and the Drive button; an unknown code says so.

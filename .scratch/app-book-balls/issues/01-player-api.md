# 01. PlayerApi: one client, HTTP and fake

Status: resolved
Spec: ../spec.md
Blocked by: none

## What

`apps/player/src/api/`: `types.ts` (the API's player shapes), `PlayerApi.ts` (the interface and `ApiError` with the API's error code and status), `HttpPlayerApi.ts` (fetch, bearer token, JSON errors), `FakePlayerApi.ts` (in memory: a demo range with bays, hours, peak prices, add-ons, buckets and passes; accounts and email links; bookings with availability, robots and hire keys; orders, bucket codes, passes and ball credit; check-in codes), `playerApi.contract.ts`, and `createPlayerApi()` choosing by `VITE_API_URL`.

## Acceptance

- [x] The contract passes on the fake, and on a live API when `RANGEOPS_API_URL` is set.
- [x] A test checks every field in `types.ts` exists in the matching `openapi.json` schema.

## Comments

Done in `apps/player/src/api/`. The contract passed against a local API (fresh data folder) with `RANGEOPS_API_URL` and `RANGEOPS_API_LOG` set. Running it there showed the API keeps a declined booking as cancelled with a failed order, and activates the hire on payment; the fake now does the same.

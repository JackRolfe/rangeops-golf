# RangeOps API

The backend for bookings, payments, bucket codes, passes, robot hires and the fleet. It runs on this machine only: no host, no real email, no real payments. The spec is [.scratch/backend-api/spec.md](../../.scratch/backend-api/spec.md) and the stack is recorded in [ADR 0010](../../docs/adr/0010-backend-stack-for-local-api.md).

```bash
cd apps/api
npm install
npm run dev        # http://localhost:8787, OpenAPI at /openapi.json
npm run dev:demo   # the same, and fills today at the demo range with bookings, buckets and passes
npm test           # Vitest, each test on a fresh in-memory database
npm run openapi    # rewrite openapi.json after changing a route
```

`apps/api` has its own `package.json` and lockfile and is not in the root workspaces yet.

## Local state

| What | Where | Notes |
| --- | --- | --- |
| Database | `.data/pglite/` (`DATA_DIR`) | PGlite, Postgres in-process. Delete the folder to start again. |
| Hire signing key | `.keys/hire-signing-key.pem` (`HIRE_SIGNING_KEY_PATH`) | Ed25519, made on first start. Robots need `GET /hire-keys/public-key`. |

Both folders are gitignored. Other settings: `SEED_DEMO_DAY=1` (fill today with demo bookings, buckets and passes, once a day), `PORT` (8787), `APP_URL` (`http://localhost:5173/app`, where sign-in, hire and check-in links point), `FAKE_PAYMENTS=decline` (every charge declines).

## Trying it

The first start seeds the demo range, slug `demo`: 8 bays, open 07:00–22:00 in Sydney, two robots (`A1B2`, `C3D4`) and a staff account `staff@rangeops.test`.

1. `POST /auth/email-link {"email": "you@example.com"}`. The link is printed in the server log, not emailed.
2. `POST /auth/verify {"token": "<token from the link>"}` gives a `sessionToken`. Send it as `Authorization: Bearer <token>`.
3. `GET /ranges/demo/availability?date=YYYY-MM-DD` for free bays and robots.
4. `POST /bookings {"bayId", "startsAt", "hours", "addOns": [{"kind": "robot"}], "paymentMethod": "pm_fake_ok"}`. The answer's `hire.link` carries the 78-byte hire key. `pm_fake_declined` declines.

## For other sessions

- **Console**: build the client from `openapi.json`; console endpoints are tagged `Console` and `Robots`. A test fails if the file drifts from the routes.
- **App**: sign-in links open `APP_URL/signin?token=…`, hire links `APP_URL/drive?hire=<base64url>`, and bay QR codes `APP_URL/check-in/<code>`, which the app posts to `POST /check-in/{code}`.
- **Firmware**: hire keys follow the 78-byte layout in [robot/README.md](../../robot/README.md#control-link-draft). `test/hire-key-vectors.test.ts` checks them against `robot/firmware/test/vectors/hire_keys.json` when that file is present.

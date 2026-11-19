# 01. Scaffold apps/api: server, database, tests, OpenAPI

Status: resolved
Blocked by: none
Spec: [../spec.md](../spec.md)

## What

Stand up `apps/api` as a self-contained package (own `package.json`, lockfile, `tsconfig.json`): Hono app built by `createApp(deps)`, PGlite database wrapper with numbered SQL migrations, `npm run dev` on port 8787 (tsx watch), a `GET /health` route, the shared error shape, Vitest with a helper that builds an app on a fresh in-memory database, and the OpenAPI generator (`npm run openapi`) with a drift test.

## Acceptance

- [ ] `npm install && npm test` pass inside `apps/api`
- [ ] `npm run dev` answers `GET /health` on 8787 with `{ok: true}`
- [ ] `openapi.json` is generated from the routes and a test fails if it is stale
- [ ] `.data/` and `.keys/` are gitignored
- [ ] Errors use `{error: {code, message}}`, including schema validation failures (400)

## Comments

Done: Hono + PGlite + Vitest scaffold. Tests clone one migrated in-memory PGlite per test. btree_gist is loaded so exclusion constraints can refuse double bookings. CORS is open to any origin for local dev.

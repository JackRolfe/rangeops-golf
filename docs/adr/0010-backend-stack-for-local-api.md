# 0010. Backend stack: Hono, PGlite and generated OpenAPI, run locally

Date: 2026-11-19
Status: accepted

## Context

Decision 4 in [docs/PLAN.md](../PLAN.md) recommends a small TypeScript API on serverless functions with Postgres and Stripe, with the host chosen when stage 4 starts. For now everything stays on this machine: no host, no database server, no payment keys. The console is being built in parallel and needs a machine-readable description of the API to build its client from.

## Decision

- **Hono** for HTTP, with `@hono/node-server` locally. Hono runs unchanged on Node, Cloudflare Workers, AWS Lambda, Vercel and Deno, so the serverless host can still be chosen later.
- **PGlite** (`@electric-sql/pglite`) as the database: real Postgres compiled to WASM, running in-process. It needs no server, keeps data under `apps/api/.data/` in dev, and runs fully in memory for each test. The SQL is plain Postgres, so moving to a hosted Postgres later is a change of driver, not of schema. Node's built-in SQLite was the alternative; it would have meant writing SQL for a different database from the one we plan to run.
- **Plain SQL migrations**, numbered files applied in order at start-up and recorded in `schema_migrations`. No ORM, to keep the dependency list short and the SQL readable.
- **`@hono/zod-openapi`**: each route is declared once with Zod schemas, which validate requests and generate the OpenAPI document. The generated `apps/api/openapi.json` is committed, and a test fails if it drifts from the routes.
- **Vitest**, calling the app through `app.request()` with a fresh in-memory database per test.
- **Ed25519 hire keys with `node:crypto`**, no extra library. See [0011](0011-hire-key-signing.md).
- **Payments behind a `PaymentProvider` interface**, with only a fake implementation until Stripe is wired in.

## Consequences

- PGlite is single-connection and slower than a server for heavy load. That doesn't matter locally; a hosted Postgres replaces it at deploy time behind the same small `Db` wrapper.
- `apps/api` has its own `package.json` and lockfile and is not in the root workspaces yet, to avoid colliding with sessions working in parallel. It should join the workspaces once those settle.

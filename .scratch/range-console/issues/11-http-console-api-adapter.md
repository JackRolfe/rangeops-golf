# 11 Point the console at the real API

Status: needs-info
Type: task
Blocked by: the backend's OpenAPI file in `apps/api` (on its own branch, not merged)

Write `HttpConsoleApi implements ConsoleApi` against the backend's OpenAPI file, and choose it over the fake with an env var (`VITE_CONSOLE_API=http://...`; unset keeps the fake). Map the backend's shapes onto the console's types in the adapter only; screens must not change. Where the backend names a concept differently from the spec's glossary, raise it rather than renaming silently.

Robot status should come from the one fleet endpoint, so a partner's portal could read the same thing ("Built to swap" in docs/PLAN.md).

Needs: the OpenAPI file merged into this branch, and a decision on how staff sign in.

## Acceptance

- The contract tests the fake passes (`src/api/consoleApi.contract.ts`) also pass against a running local API.

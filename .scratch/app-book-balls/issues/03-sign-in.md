# 03. Sign in by email link

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 01, 02

## What

A session store (`localStorage`), `SignInCard` (email, "check your email", a demo-mode shortcut link), handling `/signin?token=…` with `POST /auth/verify`, the account in Settings (email, sign out), and dropping the session on a 401.

## Acceptance

- [ ] Component tests: request a link, open it, signed in; sign out; an expired or used link says so.

# 03. Sign in by email link

Status: resolved
Spec: ../spec.md
Blocked by: 01, 02

## What

A session store (`localStorage`), `SignInCard` (email, "check your email", a demo-mode shortcut link), handling `/signin?token=…` with `POST /auth/verify`, the account in Settings (email, sign out), and dropping the session on a 401.

## Acceptance

- [x] Component tests: request a link, open it, signed in; sign out; an expired or used link says so.

## Comments

Done in `apps/player/src/account/`: `AccountProvider` (one API, session in localStorage, dropped on 401), `SignInCard`, `AccountSection` in Settings. The app swaps a `/signin?token=` link for a session at start and says so in Settings.

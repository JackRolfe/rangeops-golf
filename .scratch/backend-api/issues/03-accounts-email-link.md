# 03. Accounts by email link

Status: resolved
Blocked by: 01
Spec: [../spec.md](../spec.md) (Accounts by email link)

## What

Accounts, sign-in links, sessions and range staff. `POST /auth/email-link`, `POST /auth/verify`, `GET /me`, `POST /auth/sign-out`. A `Mailer` interface with a console implementation; tests capture mail. Auth middleware (`requireAccount`, `requireStaff(rangeId)`). Seed the demo staff account. One account across ranges (idea 1).

## Acceptance

- [ ] The sign-in link is printed to the console log in dev, never sent
- [ ] Tokens are single use, expire after 15 minutes, and only their hashes are stored
- [ ] Sessions expire after 30 days; sign-out ends one
- [ ] Unknown, used or expired tokens get 401

## Comments

Done. Sign-in links point at `APP_URL/signin?token=…` (default `http://localhost:5173/app`), so the app needs a `/signin` screen that posts the token to `/auth/verify`. The demo staff account is `staff@rangeops.test`; sign in as it through the logged link. Also added `PATCH /me` to set a name.

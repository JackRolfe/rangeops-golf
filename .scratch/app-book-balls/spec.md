# Spec: App stage 4, Book, Balls and links

Status: ready-for-agent
Source: `docs/PLAN.md`, "The app", stage 4; the API in `apps/api` (`openapi.json`); ADR 0021 (passes and ball credit).

## Problem

The app plays games and drives a simulated robot, but it can't book a bay, sell balls, or open the links the backend sends out: sign-in links, hire links and bay QR codes. Stage 4 adds the Book and Balls tabs against the real API, keeping practice local and usable with no account.

## What done looks like

- **One client.** `PlayerApi` covers the player endpoints in `apps/api/openapi.json`. `HttpPlayerApi` talks to the API at `VITE_API_URL`. `FakePlayerApi` is an in-memory stand-in. Both pass one contract test; the HTTP one also runs it against a live API when `RANGEOPS_API_URL` is set.
- **Sign in by email link.** Enter an email, open the link, and `/app/signin?token=…` signs you in. The session is kept on the device. Games and Drive never need an account; Book and Balls ask you to sign in.
- **Book.** Pick a day, a time, how long and a bay, then add a robot, club hire or a lesson. Pay with the fake provider and see your bookings. You can cancel a booking, and a booking with a robot opens Drive with its hire key.
- **Balls.** Buy a bucket by card or with ball credit and see its code. Your unused codes, passes and ball credit are listed, and you can buy a monthly pass or a credit pack.
- **Links.** `/app/drive?hire=<base64url>` opens Drive with that hire key, still on the simulator. `/app/check-in/<code>` posts to `POST /check-in/{code}` and offers Drive if a robot was hired.
- `npm test`, `npm run typecheck` and `npm run build` pass at the root. A Playwright flow runs against a local API.

## Decisions (reversible, made here)

| Decision | Choice | Why |
| --- | --- | --- |
| Shape of the client | One `PlayerApi` interface, as the console does with `ConsoleApi` (ADR 0020): Http and Fake, one contract test. Types are written by hand in `api/types.ts`; a test checks their fields against `openapi.json`. | No code generator to install; the drift test catches changes. |
| No `VITE_API_URL` | The app uses `FakePlayerApi` and says "Demo mode: nothing is booked or charged" on Book, Balls and the account. | `npm run dev` and tests work offline. A deploy must set `VITE_API_URL` (below). |
| Which range | `GET /ranges`. With one range, the app uses it; with several, Book and Balls let you choose, and the choice is remembered. | The demo has one range; a player may visit several. |
| Session storage | `localStorage` (`rangeops.session`), dropped when it expires or the API answers 401. | It's a bearer token, nothing else; practice data stays in IndexedDB. |
| Practice without an account | Games keeps working signed out. Setting up the range map moves inside the Games tab, so the other tabs work before a map exists (a link opened on a fresh phone lands where it should). | Plan rule 2: practice works without an account. |
| Tabs | Games, Drive, Book, Balls, Settings. The account (sign in and out) lives in Settings. | The demo's four tabs plus Settings. |
| Paying | The fake provider: `pm_fake_ok`, shown as a test card. The API's `pm_fake_declined` is used only in tests. | No real money (decision 4 in the plan is still open). |
| Prices shown before paying | The app adds up slot prices and add-ons for an estimate; the API's total is what is charged and is shown after. A pass discount appears in the API total. | The API owns pricing. |
| Hire keys in Drive | A hire link's key goes to the simulated robot, which takes the key's robot serial and trusts the key-signing public key from `GET /hire-keys/public-key`, so it checks the backend's real Ed25519 signature. With the fake API, keys are bench-signed and the simulator trusts the bench verifier. | Drive stays on the simulator, but the key check is the real one. |
| Link paths | The router strips Vite's base (`/app/` when built for the site) and also accepts a leading `app/`, so the API's default `APP_URL` (`http://localhost:5173/app`) works with `npm run dev`. After handling a link the app puts the base URL back in the address bar. | One router for dev and the deployed app. |
| Check-in signed out | The code is kept for the session; after signing in, the check-in goes ahead. | A QR scan is often the first thing a player does. |

## What the deploy needs (not changed here)

The site's Static Web App serves `dist/`, with the app under `dist/app/`. Static Web Apps read `staticwebapp.config.json` only from the root of what is deployed, so a file in `apps/player/public` would end up at `dist/app/` and be ignored. Two changes outside `apps/player` are needed, which the deploy owner should make:

1. A `staticwebapp.config.json` at the root of `dist/` (for example `apps/site/staticwebapp.config.json`, which `scripts/build.mjs` copies there) with a fallback for app routes:

   ```json
   {
     "navigationFallback": {
       "rewrite": "/app/index.html",
       "exclude": ["/*.{css,js,svg,png,jpg,jpeg,webp,ico,json,txt,webmanifest,woff,woff2}"]
     },
     "routes": [{ "route": "/", "rewrite": "/index.html" }]
   }
   ```

   A fallback this broad sends any unknown path to the app, which shows Games. If the site gains more pages, narrow it with a route `{"route": "/app/*", "rewrite": "/app/index.html"}` instead.
2. `deploy/azure/deploy.sh` builds the site and app with `npm run build`; set `VITE_API_URL="$api_url"` on that line so the app talks to the API instead of the fake. The API's `APP_URL` must be the app's public address (`https://<site>/app`).

## Out of scope

The robot over Bluetooth (stage 3), real payments, range maps published by a range ("skip the upload step"), and staff screens.

## Tickets

In blocker order, under `issues/`:

1. `01-player-api.md`: `PlayerApi`, `HttpPlayerApi`, `FakePlayerApi`, contract test.
2. `02-links-and-tabs.md`: the link router, the five tabs, set-up inside Games. Blocked by 01.
3. `03-sign-in.md`: email-link sign-in, session, account in Settings. Blocked by 01, 02.
4. `04-book.md`: Book tab and your bookings. Blocked by 03.
5. `05-balls.md`: Balls tab, wallet, passes and credit. Blocked by 03.
6. `06-hire-and-check-in-links.md`: Drive from a hire key, check-in. Blocked by 02, 03, 04.
7. `07-e2e-against-local-api.md`: Playwright against `npm run dev:api`, root checks. Blocked by 04, 05, 06.

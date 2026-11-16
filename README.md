# RangeOps

RangeOps is one offering for a trip to the driving range: an app to book a bay, buy a bucket, play target games and track accuracy, and a small remote-control robot that fetches the short shots so juniors can hit them again.

This repository holds all of it: the app, the site, the robot and the plan.

## The products

| Product | What it is | Where | Status |
| --- | --- | --- | --- |
| RangeOps app | The phone app golfers and families use. Practice tracking today; games, driving the robot, booking and buying balls to come. | [apps/player](apps/player) | Practice tracking works. The rest is planned. |
| Mulligan | The robot. A knee-high buggy a child drives from the app to scoop up topped shots and bring them back to the bay. | [robot](robot) | Not built yet. Build plan written. |
| Range console | The range owner's side: bays, prices, bookings, bucket codes and the robot fleet. | not started | Planned, after the robot and games. |
| Site | The public page that explains the offering, with a working demo of where the app is heading. | [apps/site](apps/site) | Live as a concept preview. |

**On names.** RangeOps is the name of the whole offering and of the app. Mulligan is the name of the robot and nothing else. It suits the robot, because a mulligan is a second go at a bad shot, and that is exactly what the robot gives you. The name has not been checked for trademark or domain availability.

## The plan

- [docs/PLAN.md](docs/PLAN.md) covers what gets built, in what order, and the decisions still open.
- [robot/README.md](robot/README.md) is the robot build plan: target spec, subsystems, build stages and the draft control link.

## Layout

```
apps/player      the RangeOps app (React, Vite, offline-capable PWA)
apps/site        the site (one HTML page with its demo inline)
packages/brand   brand colours and type, shared by the app and the site
robot            the Mulligan build plan; firmware and CAD will live here
docs             the product and build plan
scripts          the build that assembles everything into dist/
```

## Run it

```bash
npm install
```

Work on the app, served at http://localhost:5173:

```bash
npm run dev
```

Build the site and the app together into `dist/`, then serve it at http://localhost:4173. The site is at `/` and the app at `/app/`:

```bash
npm run build
```

```bash
npm run preview
```

After editing only `apps/site` or `packages/brand`, this refreshes `dist/` without rebuilding the app:

```bash
npm run build:site
```

Checks:

```bash
npm test
```

```bash
npm run test:e2e
```

The end-to-end tests run against the app on its own by default. To run them against the combined build instead, serve `dist/` and set `RANGEOPS_E2E_URL` to the app's address, for example `http://127.0.0.1:4173/app/`.

## Deploy

`npm run build` produces a static folder, `dist/`, that any static host can serve. The site was first deployed to the Azure Static Web App `mulligan-range-robot` in resource group `rg-mulligan`, and the same app can serve the combined build:

```bash
export SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list --name mulligan-range-robot --resource-group rg-mulligan --query properties.apiKey -o tsv)"
npx -y @azure/static-web-apps-cli deploy ./dist --env production
```

If the site is served from a sub-path instead of the domain root, set `RANGEOPS_BASE` when building, for example `RANGEOPS_BASE=/rangeops-golf/ npm run build`.

## Data and privacy

The app stores the range image, sessions and preferences in IndexedDB in the browser. There is no server, account, analytics or cloud sync yet, and clearing site data removes the history. Accounts arrive with booking; see the plan.

## History

This repository merges two earlier ones with their histories intact: `rangeops-golf` (the practice app) and `mulligan-range-robot` (the robot concept site).

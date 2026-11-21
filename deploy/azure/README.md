# RangeOps on Azure

A demo deployment, in one resource group in the Pay-As-You-Go subscription. This is the only place RangeOps is hosted: GitHub Pages is switched off, and nothing here needs a push to GitHub.

| What | Azure resource | Address |
| --- | --- | --- |
| Site, and the practice app at `/app/` | Static Web App `swa-rangeops-site`, Free | https://gray-pond-0a3488900.6.azurestaticapps.net |
| Range console | Static Web App `swa-rangeops-console`, Free | https://white-desert-0b3161200.4.azurestaticapps.net |
| API | Container App `ca-rangeops-api` in environment `cae-rangeops`, scales to zero, at most one replica | https://ca-rangeops-api.yellowmushroom-aed5aed6.australiaeast.azurecontainerapps.io |
| API images | Container registry `rangeopsacrefadb4`, Basic | |

All in `rg-rangeops-aue`, Australia East. Static Web Apps only offer a few regions for their settings; these sit in East Asia and serve from Microsoft's global edge.

## What it costs

Roughly A$8–15 a month while quiet: the registry (Basic, about US$5) is the steady cost. The Static Web Apps are free. The Container App scales to zero, so it costs little when nobody is using it, and its logs go to a Log Analytics workspace that charges by volume.

To stop all costs, delete the group: `az group delete -n rg-rangeops-aue`. That can't be undone.

## How it behaves

- **Data can reset.** The API keeps its data in PGlite inside the container. When the app scales to zero or restarts, it starts again from the seeded demo range (slug `demo`), and fills today with demo bookings (`SEED_DEMO_DAY=1`).
- **Payments are fake.** No money moves.
- **Sign-in links go to the API's log, not email.** To sign in to the console as `staff@rangeops.test`, request a link on the sign-in screen, then read it from the log:

  ```bash
  az containerapp logs show -n ca-rangeops-api -g rg-rangeops-aue --tail 50
  ```

- **The hire signing key** is a Container App secret (`hire-signing-key`), so hire keys stay valid across restarts. Its public half is at `/hire-keys/public-key`.
- **The first request after a quiet spell is slow**, while the API starts from zero.

## Shipping a new version

```bash
deploy/azure/deploy.sh
```

It builds the API image in the registry and rolls the Container App onto it, then rebuilds and uploads the site, the app and the console. The app and the console are built pointing at the API (`VITE_API_URL`, `VITE_CONSOLE_API`); built without it, the app runs in demo mode and books nothing.

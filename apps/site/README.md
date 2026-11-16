# Mulligan range robot

A concept site for Mulligan, a small remote-control robot that fetches short shots at a driving range. The page includes a working mock-up of the app: driving the robot, target games, booking a bay and buying a bucket of balls.

Nothing here is a real product yet. The robot, prices and specs are placeholders for pitching the idea.

Live site: https://brave-tree-067784200.8.azurestaticapps.net

## Files

- `mulligan.html` is the page source: one file with its styles and script inline.
- `site/index.html` is the deployable copy, generated from `mulligan.html`.
- `build.sh` regenerates `site/index.html`.

## Change and redeploy

Edit `mulligan.html`, then rebuild:

```bash
./build.sh
```

Deploy to the Azure Static Web App `mulligan-range-robot` in resource group `rg-mulligan`:

```bash
export SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list --name mulligan-range-robot --resource-group rg-mulligan --query properties.apiKey -o tsv)"
npx -y @azure/static-web-apps-cli deploy ./site --env production
```

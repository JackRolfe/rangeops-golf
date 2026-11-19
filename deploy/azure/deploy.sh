#!/usr/bin/env bash
# Redeploys RangeOps to its Azure resource group: the API image, the site
# and practice app, and the console. The resources already exist (see
# README.md); this only ships new code. Run from the repository root.
set -euo pipefail

RG=rg-rangeops-aue
ACR=rangeopsacrefadb4
API_APP=ca-rangeops-api
SITE_SWA=swa-rangeops-site
CONSOLE_SWA=swa-rangeops-console

tag=$(git rev-parse --short HEAD)
api_url="https://$(az containerapp show -n "$API_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"

echo "API: building $ACR/rangeops-api:$tag in the registry"
az acr build -r "$ACR" -g "$RG" -t "rangeops-api:$tag" -t rangeops-api:latest -f apps/api/Dockerfile . -o none
az containerapp update -n "$API_APP" -g "$RG" --image "$ACR.azurecr.io/rangeops-api:$tag" -o none

echo "Site and practice app"
npm run build
npx -y @azure/static-web-apps-cli@2 deploy ./dist --env production \
  --deployment-token "$(az staticwebapp secrets list -n "$SITE_SWA" -g "$RG" --query properties.apiKey -o tsv)"

echo "Console, pointed at $api_url"
VITE_CONSOLE_API="$api_url" VITE_CONSOLE_RANGE=demo npm run build -w @rangeops/console
npx -y @azure/static-web-apps-cli@2 deploy ./apps/console/dist --env production \
  --deployment-token "$(az staticwebapp secrets list -n "$CONSOLE_SWA" -g "$RG" --query properties.apiKey -o tsv)"

# The RangeOps API as a container, built from the repository root so the
# workspace lockfile pins its dependencies:
#   docker build -f apps/api/Dockerfile .
FROM node:22-slim

WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/player/package.json apps/player/
COPY apps/console/package.json apps/console/
COPY packages/brand/package.json packages/brand/
RUN npm ci -w @rangeops/api --no-audit --no-fund

COPY apps/api apps/api
WORKDIR /repo/apps/api

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data/pglite \
    HIRE_SIGNING_KEY_PATH=/keys/hire-signing-key.pem
EXPOSE 8080

# HIRE_SIGNING_KEY_PEM, when set (from a secret), becomes the signing key
# file, so hire keys stay valid across restarts. Without it the API makes one.
CMD ["sh", "-c", "mkdir -p /keys /data && if [ -n \"$HIRE_SIGNING_KEY_PEM\" ]; then printf '%s\\n' \"$HIRE_SIGNING_KEY_PEM\" > \"$HIRE_SIGNING_KEY_PATH\" && chmod 600 \"$HIRE_SIGNING_KEY_PATH\"; fi && exec node --import tsx src/server.ts"]

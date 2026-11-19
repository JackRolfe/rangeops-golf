import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Runs the app against a real RangeOps API on this machine: a fresh API (its own
// data folder, its output in a log file the tests read sign-in links from) and an
// app build pointed at it with VITE_API_URL. Nothing leaves the machine.
const work = join(tmpdir(), 'rangeops-e2e-api');
export const API_PORT = 8792;
export const APP_PORT = 4175;
export const API_LOG = join(work, 'api.log');
const appUrl = `http://127.0.0.1:${APP_PORT}/app`;
const apiUrl = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: './e2e-api',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: join(work, 'results'),
  use: {
    baseURL: `${appUrl}/`,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `rm -rf "${work}/data" && mkdir -p "${work}/data" && cd ../api && DATA_DIR="${work}/data" HIRE_SIGNING_KEY_PATH="${work}/data/hire-key.pem" PORT=${API_PORT} APP_URL=${appUrl} npx tsx src/server.ts > "${API_LOG}" 2>&1`,
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Built at /app/, as on the site, so links take the deployed shape.
      command: `VITE_API_URL=${apiUrl} npx vite build --base=/app/ --outDir "${work}/app" --emptyOutDir && npx vite preview --base=/app/ --outDir "${work}/app" --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
      url: `${appUrl}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

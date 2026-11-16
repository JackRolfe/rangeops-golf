import { defineConfig } from '@playwright/test';

// By default the tests build nothing and run against `vite preview` of this app at /.
// Set RANGEOPS_E2E_URL to run them against an app that is already being served
// somewhere else, for example the full RangeOps build: http://127.0.0.1:4180/app/
const externalUrl = process.env.RANGEOPS_E2E_URL;
const baseURL = externalUrl ?? 'http://127.0.0.1:4173/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/rangeops-playwright',
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    locale: 'en-AU',
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});

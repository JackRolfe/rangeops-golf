import { defineConfig } from '@playwright/test';

// Builds nothing: runs against `vite preview` of a built console. Run `npm run build` first.
const baseURL = process.env.CONSOLE_E2E_URL ?? 'http://127.0.0.1:4174/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/rangeops-console-playwright',
  use: {
    baseURL,
    viewport: { width: 1280, height: 860 },
    locale: 'en-AU',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.CONSOLE_E2E_URL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});

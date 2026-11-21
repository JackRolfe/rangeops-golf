/// <reference types="node" />
// The ConsoleApi contract against a running RangeOps API. Skipped unless CONSOLE_API_URL and
// CONSOLE_API_TOKEN (a staff session token) are set. It changes data: it checks a player in,
// cancels a booking and hands over a bucket, so run it against a local, seeded API only:
//
//   cd apps/api && DATA_DIR=/tmp/rangeops-live SEED_DEMO_DAY=1 npm start
//   CONSOLE_API_URL=http://localhost:8787 CONSOLE_API_TOKEN=<token> npx vitest run src/api/http/HttpConsoleApi.live.test.ts
import { describe, it } from 'vitest';
import { consoleApiContract } from '../consoleApi.contract';
import { HttpConsoleApi } from './HttpConsoleApi';

const baseUrl = process.env.CONSOLE_API_URL;
const token = process.env.CONSOLE_API_TOKEN;

if (baseUrl && token) {
  consoleApiContract('HttpConsoleApi against a running API', () => ({
    api: new HttpConsoleApi({ baseUrl, token, rangeId: process.env.CONSOLE_API_RANGE ?? 'demo' }),
    clock: () => new Date(),
  }));
} else {
  describe.skip('HttpConsoleApi against a running API (set CONSOLE_API_URL and CONSOLE_API_TOKEN)', () => {
    it('meets the ConsoleApi contract', () => {});
  });
}

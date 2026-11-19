import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { consoleMailer } from './auth/mailer.js';
import { openDatabase } from './db/db.js';
import { seedDemo } from './db/seed.js';
import type { Deps } from './deps.js';
import { loadOrCreateSigner } from './hires/signer.js';
import { FakePaymentProvider } from './payments/fake.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.DATA_DIR ?? `${root}.data/pglite`;

await mkdir(dataDir, { recursive: true });
const db = await openDatabase(dataDir);
if (await seedDemo(db)) console.log('Seeded the demo range (slug: demo).');

const keyPath = process.env.HIRE_SIGNING_KEY_PATH ?? `${root}.keys/hire-signing-key.pem`;
const { signer, created } = await loadOrCreateSigner(keyPath);
if (created) console.log(`Made a new hire signing key at ${keyPath}. Robots need its public key: GET /hire-keys/public-key`);

const deps: Deps = {
  db,
  now: () => new Date(),
  config: { appUrl: process.env.APP_URL ?? 'http://localhost:5173/app' },
  mailer: consoleMailer,
  payments: new FakePaymentProvider(process.env.FAKE_PAYMENTS === 'decline'),
  signer,
};

const app = createApp(deps);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`RangeOps API on http://localhost:${info.port}  (OpenAPI at /openapi.json, data in ${dataDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}

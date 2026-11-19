import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApiDocument } from '../src/app.js';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => (t = await makeTestApp()));
afterAll(() => t.close());

it('openapi.json matches the routes (run `npm run openapi` if this fails)', async () => {
  const committed = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'));
  expect(committed).toEqual(JSON.parse(JSON.stringify(openApiDocument(t.app))));
});

it('serves the same document at /openapi.json', async () => {
  const res = await t.call('GET', '/openapi.json');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(JSON.parse(JSON.stringify(openApiDocument(t.app))));
});

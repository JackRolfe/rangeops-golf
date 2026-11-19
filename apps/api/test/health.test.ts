import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => (t = await makeTestApp()));
afterEach(() => t.close());

describe('health', () => {
  it('answers with the clock time', async () => {
    const res = await t.call('GET', '/health');
    expect(res).toEqual({ status: 200, body: { ok: true, time: '2026-11-23T22:00:00.000Z' } });
  });

  it('answers unknown routes with the error shape', async () => {
    const res = await t.call('GET', '/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

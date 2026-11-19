import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { createApp, type Api } from '../src/app.js';
import { CapturingMailer } from '../src/auth/mailer.js';
import { Db, migrate } from '../src/db/db.js';
import { seedDemo } from '../src/db/seed.js';
import type { Deps } from '../src/deps.js';

let template: Promise<PGlite> | undefined;

/** Migrated (and seeded) once per test file, then cloned for each test: a fresh in-memory database. */
async function freshPg() {
  template ??= (async () => {
    const pg = await PGlite.create({ extensions: { btree_gist } });
    await migrate(pg);
    await seedDemo(new Db(pg));
    return pg;
  })();
  return (await template).clone();
}

export class TestClock {
  constructor(public current = new Date('2026-11-23T22:00:00Z')) {} // Tue 24 Nov 2026, 09:00 in Sydney
  now = () => new Date(this.current);
  set(iso: string) {
    this.current = new Date(iso);
  }
}

export interface TestApp {
  app: Api;
  deps: Deps;
  clock: TestClock;
  mailer: CapturingMailer;
  /** Signs in by email link and returns the session token. */
  signIn: (email: string) => Promise<string>;
  close: () => Promise<void>;
  /** Calls the app with a JSON body and returns status and parsed JSON. */
  call: (method: string, path: string, opts?: { body?: unknown; token?: string }) => Promise<{ status: number; body: any }>;
}

export async function makeTestApp(): Promise<TestApp> {
  const db = new Db(await freshPg());
  const clock = new TestClock();
  const mailer = new CapturingMailer();
  const deps: Deps = {
    db,
    now: clock.now,
    config: { appUrl: 'https://app.rangeops.test' },
    mailer,
  };
  const app = createApp(deps);
  const call: TestApp['call'] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await app.request(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  const signIn = async (email: string) => {
    await call('POST', '/auth/email-link', { body: { email } });
    const token = new URL(/https:\S+/.exec(mailer.last().text)![0]).searchParams.get('token')!;
    const res = await call('POST', '/auth/verify', { body: { token } });
    if (res.status !== 200) throw new Error(`sign in failed: ${JSON.stringify(res.body)}`);
    return res.body.sessionToken as string;
  };
  return { app, deps, clock, mailer, call, signIn, close: () => db.close() };
}

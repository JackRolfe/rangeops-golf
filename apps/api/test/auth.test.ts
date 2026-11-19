import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => (t = await makeTestApp()));
afterEach(() => t.close());

const tokenFromMail = () => new URL(/https:\S+/.exec(t.mailer.last().text)![0]).searchParams.get('token')!;

describe('accounts by email link', () => {
  it('mails a link to the app and signs in with it, creating the account', async () => {
    const sent = await t.call('POST', '/auth/email-link', { body: { email: ' Kid.Parent@Example.com ' } });
    expect(sent).toEqual({ status: 202, body: { sent: true } });
    const mail = t.mailer.last();
    expect(mail.to).toBe('kid.parent@example.com');
    expect(mail.text).toContain('https://app.rangeops.test/signin?token=');

    const res = await t.call('POST', '/auth/verify', { body: { token: tokenFromMail(), name: 'Sam' } });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ email: 'kid.parent@example.com', name: 'Sam' });
    expect(res.body.expiresAt).toBe('2026-12-23T22:00:00.000Z');

    const me = await t.call('GET', '/me', { token: res.body.sessionToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ account: res.body.account, staffAt: [] });
  });

  it('stores only hashes of tokens', async () => {
    await t.call('POST', '/auth/email-link', { body: { email: 'a@example.com' } });
    const token = tokenFromMail();
    const rows = await t.deps.db.many<{ token_hash: string }>('select token_hash from sign_in_links');
    expect(rows[0]!.token_hash).not.toContain(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses a link once only', async () => {
    await t.call('POST', '/auth/email-link', { body: { email: 'a@example.com' } });
    const token = tokenFromMail();
    expect((await t.call('POST', '/auth/verify', { body: { token } })).status).toBe(200);
    const again = await t.call('POST', '/auth/verify', { body: { token } });
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('unauthorized');
  });

  it('expires links after 15 minutes', async () => {
    await t.call('POST', '/auth/email-link', { body: { email: 'a@example.com' } });
    t.clock.set('2026-11-23T22:15:01Z');
    expect((await t.call('POST', '/auth/verify', { body: { token: tokenFromMail() } })).status).toBe(401);
  });

  it('refuses unknown tokens and malformed emails', async () => {
    expect((await t.call('POST', '/auth/verify', { body: { token: 'nope' } })).status).toBe(401);
    const bad = await t.call('POST', '/auth/email-link', { body: { email: 'not-an-email' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('bad_request');
  });

  it('signs in to the same account every time', async () => {
    const a = await t.signIn('a@example.com');
    const b = await t.signIn('A@example.com');
    const meA = await t.call('GET', '/me', { token: a });
    const meB = await t.call('GET', '/me', { token: b });
    expect(meA.body.account.id).toBe(meB.body.account.id);
  });

  it('expires sessions after 30 days and ends them on sign-out', async () => {
    const token = await t.signIn('a@example.com');
    t.clock.set('2026-12-23T22:00:01Z');
    expect((await t.call('GET', '/me', { token })).status).toBe(401);

    const fresh = await t.signIn('a@example.com');
    expect((await t.call('POST', '/auth/sign-out', { token: fresh })).status).toBe(204);
    expect((await t.call('GET', '/me', { token: fresh })).status).toBe(401);
  });

  it('needs a session for /me', async () => {
    expect((await t.call('GET', '/me')).status).toBe(401);
    expect((await t.call('GET', '/me', { token: 'made-up' })).status).toBe(401);
  });

  it('lets you set a name', async () => {
    const token = await t.signIn('a@example.com');
    const res = await t.call('PATCH', '/me', { token, body: { name: 'Alex' } });
    expect(res.body.account.name).toBe('Alex');
  });

  it('lists the ranges a staff account runs', async () => {
    const token = await t.signIn('staff@rangeops.test');
    const me = await t.call('GET', '/me', { token });
    expect(me.body.staffAt.map((r: any) => r.slug)).toEqual(['demo']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { signIn, tokenFromLink } from './session';

describe('tokenFromLink', () => {
  it('takes the token from a pasted link, or a bare token', () => {
    expect(tokenFromLink('http://localhost:5173/app/signin?token=abc123 ')).toBe('abc123');
    expect(tokenFromLink('https://x.test/signin?next=a&token=t%2Bk#top')).toBe('t+k');
    expect(tokenFromLink('  abc123\n')).toBe('abc123');
  });
});

describe('signIn', () => {
  const ranges = [
    { id: 'r1', slug: 'north', name: 'North Range', timeZone: 'Australia/Sydney', currency: 'AUD' },
    { id: 'r2', slug: 'demo', name: 'RangeOps Demo Range', timeZone: 'Australia/Sydney', currency: 'AUD' },
  ];
  const fakeFetch = (staffAt: typeof ranges) =>
    vi.fn(async (url: string | URL | Request) => {
      const path = String(url).replace('http://api.test', '');
      if (path === '/auth/verify') return Response.json({ sessionToken: 'sess', expiresAt: '2026-12-01T00:00:00Z' });
      if (path === '/me') return Response.json({ account: { id: 'a', email: 'staff@rangeops.test', name: null }, staffAt });
      return Response.json({ error: { code: 'not_found', message: 'No such route.' } }, { status: 404 });
    }) as unknown as typeof fetch;

  it('signs in and picks the preferred range, else the first', async () => {
    const preferred = await signIn('http://api.test/', 'http://localhost:5173/app/signin?token=t', 'demo', fakeFetch(ranges));
    expect(preferred).toEqual({ baseUrl: 'http://api.test', token: 'sess', rangeId: 'r2', rangeName: 'RangeOps Demo Range', email: 'staff@rangeops.test' });
    expect((await signIn('http://api.test', 't', undefined, fakeFetch(ranges))).rangeId).toBe('r1');
  });

  it('refuses an account that runs no range', async () => {
    await expect(signIn('http://api.test', 't', undefined, fakeFetch([]))).rejects.toThrow("staff@rangeops.test isn't staff at any range.");
  });
});

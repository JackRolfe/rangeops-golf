// Staff sign-in against the API: the same email link players use. Locally the API prints the link in
// its log instead of emailing it, so staff paste the link (or just its token) back into the console.
import type { ApiMe, ApiSession } from './apiTypes';

export interface StaffSession {
  baseUrl: string;
  token: string;
  rangeId: string;
  rangeName: string;
  email: string;
}

const STORAGE_KEY = 'rangeops-console-session';

/** The token from a pasted sign-in link, or the pasted token itself. */
export function tokenFromLink(input: string): string {
  const text = input.trim();
  const match = /[?&]token=([^&#\s]+)/.exec(text);
  return match ? decodeURIComponent(match[1]!) : text;
}

async function post<T>(fetchFn: typeof fetch, url: string, body: unknown, token?: string): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(json?.error?.message ?? `The API answered ${response.status}.`);
  return json as T;
}

export async function requestLink(baseUrl: string, email: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await post(fetchFn, `${trim(baseUrl)}/auth/email-link`, { email: email.trim() });
}

/**
 * Signs in with a link's token and picks the range to run: `preferredRange` (id or slug) if this
 * account is staff there, else the first range it is staff at.
 */
export async function signIn(baseUrl: string, linkOrToken: string, preferredRange?: string, fetchFn: typeof fetch = fetch): Promise<StaffSession> {
  const base = trim(baseUrl);
  const session = await post<ApiSession>(fetchFn, `${base}/auth/verify`, { token: tokenFromLink(linkOrToken) });
  const response = await fetchFn(`${base}/me`, { headers: { authorization: `Bearer ${session.sessionToken}` } });
  if (!response.ok) throw new Error(`The API answered ${response.status}.`);
  const me = (await response.json()) as ApiMe;
  const range = me.staffAt.find((r) => r.id === preferredRange || r.slug === preferredRange) ?? me.staffAt[0];
  if (!range) throw new Error(`${me.account.email} isn't staff at any range.`);
  return { baseUrl: base, token: session.sessionToken, rangeId: range.id, rangeName: range.name, email: me.account.email };
}

export async function signOut(session: StaffSession, fetchFn: typeof fetch = fetch): Promise<void> {
  await post(fetchFn, `${session.baseUrl}/auth/sign-out`, {}, session.token).catch(() => undefined);
}

/** The session is kept in this browser only, so a reload doesn't sign staff out. */
export function loadSession(baseUrl: string): StaffSession | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StaffSession | null;
    return saved && saved.baseUrl === trim(baseUrl) && saved.token ? saved : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StaffSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; staff just sign in again next time.
  }
}

const trim = (url: string) => url.replace(/\/+$/, '');

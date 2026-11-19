// The QR code at each bay links into the player app's check-in for that range and bay.
// It is static and printed once, so it carries no secret: the player's own booking in the app is what
// starts the session and, with a robot hired, gets the hire key.
import type { Bay, Range } from './types';

export function checkInUrl(range: Pick<Range, 'id' | 'publicAppUrl'>, bay: Pick<Bay, 'id'>): string {
  const base = range.publicAppUrl.endsWith('/') ? range.publicAppUrl : `${range.publicAppUrl}/`;
  const url = new URL('check-in', base);
  url.searchParams.set('range', range.id);
  url.searchParams.set('bay', bay.id);
  return url.toString();
}

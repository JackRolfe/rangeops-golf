// The QR code at each bay links into the player app's check-in for that range and bay.
// The fake builds a static link with no secret; the API issues each bay its own secret code and link,
// which wins when present. Either way the player's own booking is what starts the session.
import type { Bay, Range } from './types';

export function checkInUrl(range: Pick<Range, 'id' | 'publicAppUrl'>, bay: Pick<Bay, 'id' | 'checkInUrl'>): string {
  if (bay.checkInUrl) return bay.checkInUrl;
  const base = range.publicAppUrl.endsWith('/') ? range.publicAppUrl : `${range.publicAppUrl}/`;
  const url = new URL('check-in', base);
  url.searchParams.set('range', range.id);
  url.searchParams.set('bay', bay.id);
  return url.toString();
}

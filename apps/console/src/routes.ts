import { useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'live', label: 'Live' },
  { id: 'today', label: 'Today' },
  { id: 'handover', label: 'Handover' },
  { id: 'passes', label: 'Passes' },
  { id: 'check-in', label: 'Check-in QR' },
  { id: 'setup', label: 'Setup' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.find((route) => route.id === id)?.id ?? 'live';
}

/** Hash routes, so every screen has a URL without a router or server rewrites. */
export function useRoute(): RouteId {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

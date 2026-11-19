import { describe, expect, it } from 'vitest';
import { routeFromHash } from './routes';

describe('routeFromHash', () => {
  it('finds a known route', () => {
    expect(routeFromHash('#/handover')).toBe('handover');
    expect(routeFromHash('#/check-in?bay=3')).toBe('check-in');
  });
  it('falls back to the live view', () => {
    expect(routeFromHash('')).toBe('live');
    expect(routeFromHash('#/nowhere')).toBe('live');
  });
});

import { describe, expect, it } from 'vitest';
import { checkInUrl } from './checkIn';

describe('checkInUrl', () => {
  it('links to the app check-in for the range and bay', () => {
    expect(checkInUrl({ id: 'demo-range', publicAppUrl: 'https://rangeops.example/app/' }, { id: 'bay-7' })).toBe(
      'https://rangeops.example/app/check-in?range=demo-range&bay=bay-7',
    );
  });

  it('works without a trailing slash and escapes ids', () => {
    expect(checkInUrl({ id: 'north range', publicAppUrl: 'https://rangeops.example/app' }, { id: 'bay-1' })).toBe(
      'https://rangeops.example/app/check-in?range=north+range&bay=bay-1',
    );
  });
});

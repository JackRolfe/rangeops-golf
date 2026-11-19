import { describe, expect, it } from 'vitest';
import { takings } from './takings';
import type { Payment } from './types';

const pay = (kind: Payment['kind'], amount: number, ref = 'x'): Payment => ({ id: `${kind}-${amount}-${ref}`, at: '2026-11-19T10:00', kind, amount, ref });

describe('takings', () => {
  it('sums each kind and the total', () => {
    const t = takings([pay('bay', 2400), pay('bay', 3200), pay('robot', 1500), pay('bucket', 1400), pay('pass', 6000)]);
    expect(t.byKind).toEqual({ bay: 5600, robot: 1500, bucket: 1400, pass: 6000 });
    expect(t.total).toBe(14500);
    expect(t.refunds).toBe(0);
    expect(t.count).toBe(5);
  });

  it('takes refunds off the kind they refund', () => {
    const t = takings([pay('bay', 3200, 'bk1'), pay('robot', 1500, 'bk1'), pay('bay', -3200, 'bk1'), pay('robot', -1500, 'bk1'), pay('bucket', 800)]);
    expect(t.byKind).toEqual({ bay: 0, robot: 0, bucket: 800, pass: 0 });
    expect(t.refunds).toBe(4700);
    expect(t.total).toBe(800);
    expect(t.count).toBe(3);
  });

  it('is zero with nothing taken', () => {
    expect(takings([])).toEqual({ byKind: { bay: 0, robot: 0, bucket: 0, pass: 0 }, refunds: 0, total: 0, count: 0 });
  });
});

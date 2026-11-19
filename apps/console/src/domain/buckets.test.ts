import { describe, expect, it } from 'vitest';
import { seededRandom } from '../api/rng';
import { generateCode, handOver, isWellFormedCode, normaliseCode } from './buckets';
import type { Order } from './types';

const order = (code: string, status: Order['status'] = 'paid'): Order => ({
  id: `ord-${code}`,
  code,
  bucket: 'medium',
  status,
  source: 'app',
  amount: 1400,
  paidAt: '2026-11-19T10:00',
  handedOverAt: status === 'handed-over' ? '2026-11-19T10:42' : null,
  passId: null,
});

describe('normaliseCode', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normaliseCode(' putt-42 ')).toBe('PUTT42');
    expect(normaliseCode('pu tt 42')).toBe('PUTT42');
  });
});

describe('isWellFormedCode', () => {
  it('takes six characters with no 0, O, 1 or I', () => {
    expect(isWellFormedCode('PUTT42')).toBe(true);
    expect(isWellFormedCode('PUTT4')).toBe(false);
    expect(isWellFormedCode('GOLF42')).toBe(false);
    expect(isWellFormedCode('PIN042')).toBe(false);
  });
});

describe('generateCode', () => {
  it('makes well-formed codes that are not taken', () => {
    const random = seededRandom('codes');
    const taken = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = generateCode(random, taken);
      expect(isWellFormedCode(code)).toBe(true);
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
  });
});

describe('handOver', () => {
  const orders = [order('PUTT42'), order('WEDG38', 'handed-over'), order('DRAW77', 'refunded')];

  it('hands over a paid bucket and stamps the time', () => {
    const result = handOver('putt-42', orders, '2026-11-19T11:05');
    expect(result).toMatchObject({ outcome: 'handed-over', order: { code: 'PUTT42', status: 'handed-over', handedOverAt: '2026-11-19T11:05' } });
  });

  it('hands a code over once only', () => {
    const first = handOver('PUTT42', orders, '2026-11-19T11:05');
    if (first.outcome !== 'handed-over') throw new Error('expected a handover');
    const after = orders.map((o) => (o.id === first.order.id ? first.order : o));
    expect(handOver('PUTT42', after, '2026-11-19T11:06')).toMatchObject({ outcome: 'already-handed-over', order: { handedOverAt: '2026-11-19T11:05' } });
  });

  it('refuses a code already handed over, refunded or unknown', () => {
    expect(handOver('WEDG38', orders, '2026-11-19T11:05').outcome).toBe('already-handed-over');
    expect(handOver('DRAW77', orders, '2026-11-19T11:05').outcome).toBe('refunded');
    expect(handOver('ZZZZ22', orders, '2026-11-19T11:05')).toEqual({ outcome: 'not-found', code: 'ZZZZ22' });
    expect(handOver('hello', orders, '2026-11-19T11:05')).toEqual({ outcome: 'malformed', code: 'HELLO' });
  });

  it('does not change the orders it was given', () => {
    handOver('PUTT42', orders, '2026-11-19T11:05');
    expect(orders[0].status).toBe('paid');
  });
});

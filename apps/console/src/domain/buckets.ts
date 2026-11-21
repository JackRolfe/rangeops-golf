// Bucket codes and handover. A bucket is a code; where it was paid for doesn't matter.
// Codes are six characters with no 0, O, 1 or I, so they can be read aloud and typed without mix-ups.
import type { LocalDateTime, Order } from './types';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** What staff typed, as a code: case, spaces and dashes don't matter. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export function isWellFormedCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch));
}

export function generateCode(random: () => number, taken: ReadonlySet<string>): string {
  for (;;) {
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
    if (!taken.has(code)) return code;
  }
}

export type HandoverResult =
  | { outcome: 'handed-over'; order: Order }
  | { outcome: 'already-handed-over'; order: Order }
  | { outcome: 'refunded'; order: Order }
  | { outcome: 'not-found'; code: string }
  | { outcome: 'malformed'; code: string };

/**
 * Decide a handover for what staff typed. Returns the order as it should be after the handover;
 * the caller stores it. A code is handed over at most once.
 */
export function handOver(input: string, orders: readonly Order[], at: LocalDateTime): HandoverResult {
  const code = normaliseCode(input);
  if (!isWellFormedCode(code)) return { outcome: 'malformed', code };
  const order = orders.find((o) => o.code === code);
  if (!order) return { outcome: 'not-found', code };
  if (order.status === 'handed-over') return { outcome: 'already-handed-over', order };
  if (order.status === 'refunded') return { outcome: 'refunded', order };
  return { outcome: 'handed-over', order: { ...order, status: 'handed-over', handedOverAt: at } };
}

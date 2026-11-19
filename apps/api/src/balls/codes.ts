import { randomInt } from 'node:crypto';

/** No I, L, O, 0 or 1, which are easy to misread off a phone screen. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 8 characters, about 39 bits. Stored as `ABCDEFGH`, shown as `ABCD-EFGH`. */
export function newBucketCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Accepts `abcd-efgh`, `ABCD EFGH` or `abcdefgh`. */
export const normaliseCode = (input: string) => input.toUpperCase().replace(/[\s-]/g, '');

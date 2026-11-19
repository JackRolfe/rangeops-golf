// Checks our hire keys against the shared vectors the robot firmware is tested
// with (written by robot/tools/hire-key.mjs). Skips until that file is on this
// branch; HIRE_KEY_VECTORS points at a copy elsewhere.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeHireKey, encodeHireKey, SERIAL, verifyHireKey } from '../src/hires/hireKey.js';
import { signerFromSeed } from '../src/hires/signer.js';

const path = process.env.HIRE_KEY_VECTORS ?? fileURLToPath(new URL('../../../robot/firmware/test/vectors/hire_keys.json', import.meta.url));
const present = existsSync(path);

interface Case {
  name: string;
  key: string;
  expect: string;
  fields?: { version: number; serial: string; start: number; end: number; bay: number };
}

describe.skipIf(!present)(`shared hire-key vectors (${path})`, () => {
  const v = present ? JSON.parse(readFileSync(path, 'utf8')) : { cases: [] };
  const signer = present ? signerFromSeed(Buffer.from(v.test_seed, 'hex')) : undefined;
  // Results the robot only reaches after the signature checked out (see results_in_check_order).
  const signedByTestKey = new Set(['ok', 'expired', 'not_yet', 'wrong_serial']);

  it('derives the same public key from the test seed', () => {
    expect(signer!.publicKey.toString('hex')).toBe(v.public_key);
  });

  it.each(v.cases as Case[])('$name', (c) => {
    const key = Buffer.from(c.key, 'hex');
    if (c.expect === 'bad_length') {
      expect(key.length).not.toBe(78);
      expect(verifyHireKey(key, signer!.publicKey)).toBe(false);
      return;
    }
    expect(decodeHireKey(key)).toMatchObject(c.fields!);
    if (c.expect === 'bad_signature') expect(verifyHireKey(key, signer!.publicKey)).toBe(false);
    if (signedByTestKey.has(c.expect)) {
      expect(verifyHireKey(key, signer!.publicKey)).toBe(true);
      // Ed25519 is deterministic, so our encoder must give the identical 78 bytes.
      if (SERIAL.test(c.fields!.serial)) expect(encodeHireKey(c.fields!, signer!).toString('hex')).toBe(c.key);
    }
  });
});

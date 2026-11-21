import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeHireKey, encodeHireKey, HIRE_KEY_LENGTH, verifyHireKey } from './hireKey.js';
import { generateSigner, loadOrCreateSigner } from './signer.js';

const fields = { serial: 'A1B2', start: 1_798_761_600, end: 1_798_765_200, bay: 3 };

describe('hire key', () => {
  it('lays out the 78 bytes as robot/README.md says', () => {
    const signer = generateSigner();
    const key = encodeHireKey(fields, signer);
    expect(key.length).toBe(HIRE_KEY_LENGTH);
    expect(key[0]).toBe(1);
    expect(key.subarray(1, 5).toString('ascii')).toBe('A1B2');
    expect(key.subarray(5, 9)).toEqual(Buffer.from([0x80, 0xec, 0x36, 0x6b])); // 1798761600 LE
    expect(key.subarray(9, 13)).toEqual(Buffer.from([0x90, 0xfa, 0x36, 0x6b])); // 1798765200 LE
    expect(key[13]).toBe(3);
    expect(decodeHireKey(key)).toMatchObject({ version: 1, ...fields });
  });

  it('is signed so the robot can check it with the public key alone', () => {
    const signer = generateSigner();
    const key = encodeHireKey(fields, signer);
    expect(signer.publicKey.length).toBe(32);
    expect(verifyHireKey(key, signer.publicKey)).toBe(true);
    expect(verifyHireKey(key, generateSigner().publicKey)).toBe(false);
  });

  it('fails the check when any signed byte changes', () => {
    const signer = generateSigner();
    const key = encodeHireKey(fields, signer);
    for (const i of [0, 1, 5, 9, 12, 13, 40]) {
      const tampered = Buffer.from(key);
      tampered[i]! ^= 1;
      expect(verifyHireKey(tampered, signer.publicKey)).toBe(false);
    }
    expect(verifyHireKey(key.subarray(0, 77), signer.publicKey)).toBe(false);
  });

  it('refuses fields that do not fit the layout', () => {
    const s = generateSigner();
    expect(() => encodeHireKey({ ...fields, serial: 'a1b2' }, s)).toThrow(/serial/);
    expect(() => encodeHireKey({ ...fields, serial: 'A1B23' }, s)).toThrow(/serial/);
    expect(() => encodeHireKey({ ...fields, bay: 256 }, s)).toThrow(/bay/);
    expect(() => encodeHireKey({ ...fields, end: fields.start }, s)).toThrow(/end/);
    expect(() => encodeHireKey({ ...fields, end: 2 ** 32 }, s)).toThrow(/uint32/);
  });

  it('keeps the signing key in a private file, made once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rangeops-key-'));
    try {
      const path = join(dir, '.keys', 'hire-signing-key.pem');
      const first = await loadOrCreateSigner(path);
      expect(first.created).toBe(true);
      expect(await readFile(path, 'utf8')).toMatch(/BEGIN PRIVATE KEY/);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const again = await loadOrCreateSigner(path);
      expect(again.created).toBe(false);
      expect(again.signer.publicKey).toEqual(first.signer.publicKey);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

#!/usr/bin/env node
// Hire keys for Mulligan: make a signing key, sign and check hire keys, and
// write the test vectors the firmware checks against. Node built-ins only.
//
// The layout is the one in robot/README.md (control link, hire key):
//
//   0       version, 1
//   1..4    the robot's four serial characters
//   5..8    start of the hire, Unix seconds, u32 little-endian
//   9..12   end of the hire, the same way
//   13      bay number
//   14..77  Ed25519 signature over bytes 0..13
//
// A key is valid while start <= now < end.
//
// Usage: node robot/tools/hire-key.mjs <keygen|sign|verify|vectors|bench-key> [options]
// Run with no arguments for help.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const KEY_LENGTH = 78;
export const BODY_LENGTH = 14;
export const SIGNATURE_LENGTH = 64;
export const VERSION = 1;

/** Results, in the order the robot checks them. The firmware uses the same names. */
export const RESULTS = ['ok', 'bad_length', 'bad_version', 'bad_signature', 'wrong_serial', 'not_yet', 'expired'];

const HERE = dirname(fileURLToPath(import.meta.url));
export const PATHS = {
  keysDir: join(HERE, '.keys'),
  privateKeyFile: 'hire-signing-key.pem',
  header: resolve(HERE, '../firmware/include/hire_public_key.h'),
  vectors: resolve(HERE, '../firmware/test/vectors/hire_keys.json'),
};

// ---------------------------------------------------------------- keys

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** A private key object from a 32-byte Ed25519 seed. */
export function privateKeyFromSeed(seed) {
  if (seed.length !== 32) throw new Error('an Ed25519 seed is 32 bytes');
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

/** A public key object from its 32 raw bytes. */
export function publicKeyFromRaw(raw) {
  if (raw.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });
}

/** The 32 raw bytes of a public key, from a public or private key object. */
export function rawPublicKey(key) {
  const pub = key.type === 'private' ? createPublicKey(key) : key;
  return Buffer.from(pub.export({ format: 'jwk' }).x, 'base64url');
}

/**
 * The test key. Its seed is published in the test vectors, so anything it
 * signs proves nothing. Bench use only (docs/adr/0004).
 */
export const TEST_SEED = createHash('sha256').update('mulligan hire-key test seed, not secret').digest();
const OTHER_SEED = createHash('sha256').update('mulligan hire-key other seed, not secret').digest();

// ---------------------------------------------------------------- layout

function checkFields({ serial, start, end, bay }) {
  if (typeof serial !== 'string' || !/^[\x21-\x7e]{4}$/.test(serial)) {
    throw new Error(`serial must be four printable ASCII characters, got ${JSON.stringify(serial)}`);
  }
  for (const [name, v] of [['start', start], ['end', end]]) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error(`${name} must be Unix seconds that fit 32 bits`);
  }
  if (end <= start) throw new Error('end must be after start');
  if (!Number.isInteger(bay) || bay < 0 || bay > 255) throw new Error('bay must be 0 to 255');
}

/** Bytes 0..13: the part that is signed. */
export function encodeHireBody(fields, { version = VERSION } = {}) {
  checkFields(fields);
  const body = Buffer.alloc(BODY_LENGTH);
  body[0] = version;
  body.write(fields.serial, 1, 4, 'latin1');
  body.writeUInt32LE(fields.start, 5);
  body.writeUInt32LE(fields.end, 9);
  body[13] = fields.bay;
  return body;
}

/** A complete 78-byte hire key. */
export function signHireKey(fields, privateKey, options) {
  const body = encodeHireBody(fields, options);
  return Buffer.concat([body, sign(null, body, privateKey)]);
}

/** The fields of a key, without checking anything. */
export function decodeHireKey(key) {
  if (key.length !== KEY_LENGTH) throw new Error(`a hire key is ${KEY_LENGTH} bytes, got ${key.length}`);
  return {
    version: key[0],
    serial: key.subarray(1, 5).toString('latin1'),
    start: key.readUInt32LE(5),
    end: key.readUInt32LE(9),
    bay: key[13],
    signature: key.subarray(BODY_LENGTH),
  };
}

/** What the robot would say about a key, checked in the robot's order. */
export function checkHireKey(key, { publicKey, serial, now }) {
  if (key.length !== KEY_LENGTH) return 'bad_length';
  const k = decodeHireKey(key);
  if (k.version !== VERSION) return 'bad_version';
  if (!verify(null, key.subarray(0, BODY_LENGTH), publicKey, k.signature)) return 'bad_signature';
  if (k.serial !== serial) return 'wrong_serial';
  if (now < k.start) return 'not_yet';
  if (now >= k.end) return 'expired';
  return 'ok';
}

// ---------------------------------------------------------------- vectors

const VECTOR_SERIAL = 'A1B2';
const VECTOR_START = 1798761600; // 2027-01-01T00:00:00Z
const VECTOR_END = VECTOR_START + 3600;

function flipBit(buf, byte, bit = 0) {
  const out = Buffer.from(buf);
  out[byte] ^= 1 << bit;
  return out;
}

/** The shared test vectors, as the text of the JSON file. Deterministic. */
export function buildVectors() {
  const testKey = privateKeyFromSeed(TEST_SEED);
  const otherKey = privateKeyFromSeed(OTHER_SEED);
  const fields = { serial: VECTOR_SERIAL, start: VECTOR_START, end: VECTOR_END, bay: 3 };
  const good = signHireKey(fields, testKey);
  const mid = VECTOR_START + 1800;

  const cases = [];
  const add = (name, key, now, expect, f = fields) => {
    const entry = { name, key: key.toString('hex'), now, expect };
    if (key.length === KEY_LENGTH) entry.fields = { version: key[0], serial: f.serial, start: f.start, end: f.end, bay: f.bay };
    cases.push(entry);
  };

  add('ok_mid_hire', good, mid, 'ok');
  add('ok_at_start', good, VECTOR_START, 'ok');
  add('ok_last_second', good, VECTOR_END - 1, 'ok');
  add('expired_at_end', good, VECTOR_END, 'expired');
  add('expired_after_end', good, VECTOR_END + 60, 'expired');
  add('not_yet_one_second_early', good, VECTOR_START - 1, 'not_yet');
  const wide = { serial: VECTOR_SERIAL, start: 0x01020304, end: 0xfffffffe, bay: 255 };
  add('ok_wide_window_bay_255', signHireKey(wide, testKey), 0x80000000, 'ok', wide);
  const other = { ...fields, serial: 'C3D4' };
  add('wrong_serial', signHireKey(other, testKey), mid, 'wrong_serial', other);
  const lower = { ...fields, serial: 'a1b2' };
  add('wrong_serial_lower_case', signHireKey(lower, testKey), mid, 'wrong_serial', lower);
  add('bad_signature_bay_changed', flipBit(good, 13), mid, 'bad_signature', { ...fields, bay: 2 });
  add('bad_signature_end_changed', flipBit(good, 12, 7), mid, 'bad_signature', { ...fields, end: (VECTOR_END ^ 0x80000000) >>> 0 });
  add('bad_signature_signature_changed', flipBit(good, 40), mid, 'bad_signature');
  add('bad_signature_other_signer', signHireKey(fields, otherKey), mid, 'bad_signature');
  add('bad_version_2', signHireKey(fields, testKey, { version: 2 }), mid, 'bad_version');
  add('bad_length_77', good.subarray(0, 77), mid, 'bad_length');
  add('bad_length_79', Buffer.concat([good, Buffer.from([0])]), mid, 'bad_length');
  add('bad_length_0', Buffer.alloc(0), mid, 'bad_length');

  const doc = {
    comment: 'Shared hire-key test vectors. TEST ONLY: test_seed is public, so the test key proves nothing. Written by robot/tools/hire-key.mjs vectors; do not edit by hand.',
    layout: 'version u8 | serial 4 ASCII | start u32 LE | end u32 LE | bay u8 | Ed25519 signature over bytes 0..13. Valid while start <= now < end.',
    results_in_check_order: RESULTS,
    test_seed: TEST_SEED.toString('hex'),
    public_key: rawPublicKey(testKey).toString('hex'),
    robot_serial: VECTOR_SERIAL,
    cases,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------- firmware header

export function publicKeyHeader(raw, { bench }) {
  const bytes = [...raw].map((b) => `0x${b.toString(16).padStart(2, '0')}`);
  const rows = [];
  for (let i = 0; i < bytes.length; i += 8) rows.push(`    ${bytes.slice(i, i + 8).join(', ')},`);
  const note = bench
    ? [
        '// BENCH KEY. This is the public half of the hire-key TEST key, whose seed is',
        '// published in test/vectors/hire_keys.json, so anyone can sign keys this',
        '// firmware accepts. Run `node robot/tools/hire-key.mjs keygen` before the',
        '// robot is anywhere other phones can reach it. See docs/adr/0004.',
      ]
    : ['// The public half of the hire-key signing key made by `hire-key.mjs keygen`.', '// The private half is in robot/tools/.keys/ and is never committed.'];
  return [
    '// Written by robot/tools/hire-key.mjs. Do not edit by hand.',
    ...note,
    '#pragma once',
    '#include <stdint.h>',
    '',
    ...(bench ? ['#define MULLIGAN_BENCH_KEY 1', ''] : []),
    'namespace mulligan {',
    'static const uint8_t kHirePublicKey[32] = {',
    ...rows,
    '};',
    '}  // namespace mulligan',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- command line

/** 'now', Unix seconds, an ISO date, or '+90s', '+30m', '+1h', '+2d' after `base`. */
export function parseTime(text, base) {
  if (text === 'now') return Math.floor(Date.now() / 1000);
  const rel = /^\+(\d+)([smhd])$/.exec(text);
  if (rel) return base + Number(rel[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[rel[2]];
  if (/^\d+$/.test(text)) return Number(text);
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new Error(`can't read the time ${JSON.stringify(text)}`);
  return Math.floor(ms / 1000);
}

function parseKeyText(text) {
  const clean = text.trim();
  return /^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0 ? Buffer.from(clean, 'hex') : Buffer.from(clean, 'base64url');
}

function loadSigningKey(keysDir) {
  const file = join(keysDir, PATHS.privateKeyFile);
  if (!existsSync(file)) throw new Error(`no signing key at ${file}. Run keygen, or pass --test-key for the bench.`);
  return createPrivateKey(readFileSync(file));
}

const HELP = `Mulligan hire keys.

  keygen    [--force] [--keys-dir DIR] [--header FILE] [--no-header]
            Make a signing key pair. The private key goes to DIR/${PATHS.privateKeyFile}
            (default robot/tools/.keys, git-ignored); the public key is written into
            the firmware header so the robot trusts it.

  sign      --serial ABCD --bay N [--start now|UNIX|ISO] [--end +1h|UNIX|ISO]
            [--test-key] [--keys-dir DIR]
            Print a hire key as hex and base64url. --end is relative to --start.

  verify    KEY [--pub HEX] [--serial ABCD] [--now now|UNIX|ISO] [--test-key] [--keys-dir DIR]
            Decode a key (hex or base64url) and say what the robot would make of it.

  vectors   Rewrite robot/firmware/test/vectors/hire_keys.json.

  bench-key Rewrite the firmware header with the public test key (docs/adr/0004).
`;

export function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      force: { type: 'boolean' },
      'keys-dir': { type: 'string' },
      header: { type: 'string' },
      'no-header': { type: 'boolean' },
      serial: { type: 'string' },
      bay: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
      'test-key': { type: 'boolean' },
      pub: { type: 'string' },
      now: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const keysDir = values['keys-dir'] ?? PATHS.keysDir;
  const headerPath = values.header ?? PATHS.header;
  const signingKey = () => (values['test-key'] ? privateKeyFromSeed(TEST_SEED) : loadSigningKey(keysDir));

  switch (command) {
    case 'keygen': {
      const file = join(keysDir, PATHS.privateKeyFile);
      if (existsSync(file) && !values.force) throw new Error(`${file} exists. Pass --force to replace it; keys it signed will stop working.`);
      const { privateKey } = generateKeyPairSync('ed25519');
      mkdirSync(keysDir, { recursive: true, mode: 0o700 });
      writeFileSync(file, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
      chmodSync(file, 0o600);
      const raw = rawPublicKey(privateKey);
      if (!values['no-header']) {
        writeFileSync(headerPath, publicKeyHeader(raw, { bench: false }));
        err(`Wrote ${headerPath}. Rebuild and flash the firmware.\n`);
      }
      err(`Private key: ${file}. Keep it; never commit it.\n`);
      out(`${raw.toString('hex')}\n`);
      return 0;
    }
    case 'sign': {
      if (!values.serial || values.bay === undefined) throw new Error('sign needs --serial and --bay');
      const start = parseTime(values.start ?? 'now', Math.floor(Date.now() / 1000));
      const end = parseTime(values.end ?? '+1h', start);
      const key = signHireKey({ serial: values.serial, start, end, bay: Number(values.bay) }, signingKey());
      err(`${values.serial}, bay ${values.bay}, ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}${values['test-key'] ? ', TEST KEY' : ''}\n`);
      out(`${key.toString('hex')}\n${key.toString('base64url')}\n`);
      return 0;
    }
    case 'verify': {
      if (positionals.length !== 1) throw new Error('verify needs one key');
      const key = parseKeyText(positionals[0]);
      const publicKey = values.pub ? publicKeyFromRaw(Buffer.from(values.pub, 'hex')) : createPublicKey(signingKey());
      const fields = key.length === KEY_LENGTH ? decodeHireKey(key) : null;
      const serial = values.serial ?? fields?.serial ?? '';
      const now = parseTime(values.now ?? 'now', 0);
      const result = checkHireKey(key, { publicKey, serial, now });
      if (fields) {
        out(`version ${fields.version}, serial ${fields.serial}, bay ${fields.bay}, ${new Date(fields.start * 1000).toISOString()} to ${new Date(fields.end * 1000).toISOString()}\n`);
      }
      out(`${result}\n`);
      return result === 'ok' ? 0 : 1;
    }
    case 'vectors': {
      const file = values.out ?? PATHS.vectors;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buildVectors());
      err(`Wrote ${file}\n`);
      return 0;
    }
    case 'bench-key': {
      writeFileSync(headerPath, publicKeyHeader(rawPublicKey(privateKeyFromSeed(TEST_SEED)), { bench: true }));
      err(`Wrote ${headerPath} with the TEST key.\n`);
      return 0;
    }
    default:
      out(HELP);
      return command ? 2 : 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`hire-key: ${e.message}\n`);
    process.exitCode = 2;
  }
}

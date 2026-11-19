// node --test robot/tools
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  BODY_LENGTH,
  KEY_LENGTH,
  PATHS,
  TEST_SEED,
  buildVectors,
  checkHireKey,
  decodeHireKey,
  encodeHireBody,
  main,
  parseTime,
  privateKeyFromSeed,
  publicKeyFromRaw,
  publicKeyHeader,
  rawPublicKey,
  signHireKey,
} from './hire-key.mjs';

const testKey = privateKeyFromSeed(TEST_SEED);
const testPub = publicKeyFromRaw(rawPublicKey(testKey));
const fields = { serial: 'A1B2', start: 0x11223344, end: 0x55667788, bay: 7 };

test('the body is laid out as the control link says', () => {
  const body = encodeHireBody(fields);
  assert.equal(body.length, BODY_LENGTH);
  assert.equal(body.toString('hex'), '01' + '41314232' + '44332211' + '88776655' + '07');
});

test('a signed key is 78 bytes and decodes to what was signed', () => {
  const key = signHireKey(fields, testKey);
  assert.equal(key.length, KEY_LENGTH);
  const k = decodeHireKey(key);
  assert.deepEqual({ serial: k.serial, start: k.start, end: k.end, bay: k.bay, version: k.version }, { ...fields, version: 1 });
  assert.equal(checkHireKey(key, { publicKey: testPub, serial: 'A1B2', now: fields.start }), 'ok');
});

test('the Ed25519 signature matches RFC 8032 for a known seed', () => {
  // RFC 8032 section 7.1, test 1: an empty message.
  const seed = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex');
  assert.equal(rawPublicKey(privateKeyFromSeed(seed)).toString('hex'), 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
});

test('bad fields are refused', () => {
  assert.throws(() => encodeHireBody({ ...fields, serial: 'ABC' }));
  assert.throws(() => encodeHireBody({ ...fields, serial: 'AB C' }));
  assert.throws(() => encodeHireBody({ ...fields, end: fields.start }));
  assert.throws(() => encodeHireBody({ ...fields, bay: 256 }));
  assert.throws(() => encodeHireBody({ ...fields, end: 2 ** 32 }));
});

test('the committed vectors are exactly what the signer writes now', () => {
  assert.equal(readFileSync(PATHS.vectors, 'utf8'), buildVectors());
});

test('every vector gives its expected result here too', () => {
  const doc = JSON.parse(buildVectors());
  const publicKey = publicKeyFromRaw(Buffer.from(doc.public_key, 'hex'));
  assert.ok(doc.cases.length >= 15);
  for (const c of doc.cases) {
    const got = checkHireKey(Buffer.from(c.key, 'hex'), { publicKey, serial: doc.robot_serial, now: c.now });
    assert.equal(got, c.expect, c.name);
  }
  assert.deepEqual(new Set(doc.cases.map((c) => c.expect)), new Set(doc.results_in_check_order));
});

test('times: now, Unix seconds, ISO and relative', () => {
  assert.equal(parseTime('1798761600', 0), 1798761600);
  assert.equal(parseTime('2027-01-01T00:00:00Z', 0), 1798761600);
  assert.equal(parseTime('+1h', 100), 3700);
  assert.equal(parseTime('+30m', 0), 1800);
  assert.ok(Math.abs(parseTime('now', 0) - Date.now() / 1000) < 5);
  assert.throws(() => parseTime('next tuesday', 0));
});

test('keygen writes a private key with mode 600, a header, and will not overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hire-key-'));
  const header = join(dir, 'hire_public_key.h');
  let pub = '';
  const quiet = { out: (s) => (pub += s), err: () => {} };
  assert.equal(main(['keygen', '--keys-dir', dir, '--header', header], quiet), 0);
  const pem = join(dir, PATHS.privateKeyFile);
  assert.equal(statSync(pem).mode & 0o777, 0o600);
  const text = readFileSync(header, 'utf8');
  assert.ok(!text.includes('MULLIGAN_BENCH_KEY'));
  assert.ok(text.includes(`0x${pub.slice(0, 2)}`));
  assert.throws(() => main(['keygen', '--keys-dir', dir, '--header', header], quiet), /exists/);

  // A key signed with it checks out with verify.
  let signed = '';
  main(['sign', '--serial', 'ZZ99', '--bay', '1', '--keys-dir', dir], { out: (s) => (signed += s), err: () => {} });
  const [hex, b64] = signed.trim().split('\n');
  assert.equal(main(['verify', hex, '--keys-dir', dir], { out: () => {}, err: () => {} }), 0);
  assert.equal(main(['verify', b64, '--keys-dir', dir], { out: () => {}, err: () => {} }), 0);
  assert.equal(main(['verify', hex, '--test-key'], { out: () => {}, err: () => {} }), 1);
});

test('the bench header carries the bench flag and the test public key', () => {
  const text = publicKeyHeader(rawPublicKey(testKey), { bench: true });
  assert.ok(text.includes('#define MULLIGAN_BENCH_KEY 1'));
  const committed = readFileSync(PATHS.header, 'utf8');
  if (committed.includes('MULLIGAN_BENCH_KEY')) assert.equal(committed, text);
});

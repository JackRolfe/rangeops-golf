// The hire key, byte for byte as in robot/README.md ("Control link (draft)"):
//
//   0       version, 1
//   1..4    robot serial, 4 ASCII characters (as in its advertised name)
//   5..8    hire start, Unix seconds, uint32 little-endian
//   9..12   hire end, the same
//   13      bay number
//   14..77  Ed25519 signature over bytes 0..13
//
// The robot accepts it while start <= now < end.
import { createPublicKey, verify } from 'node:crypto';
import type { HireKeySigner } from './signer.js';

export const HIRE_KEY_VERSION = 1;
export const HIRE_KEY_LENGTH = 78;
const PAYLOAD_LENGTH = 14;

export interface HireKeyFields {
  version: number;
  serial: string;
  /** Unix seconds. */
  start: number;
  /** Unix seconds. */
  end: number;
  bay: number;
}

export const SERIAL = /^[A-Z0-9]{4}$/;

export function hireKeyPayload(f: HireKeyFields): Buffer {
  if (!SERIAL.test(f.serial)) throw new RangeError(`Robot serial must be 4 characters A–Z or 0–9, got ${JSON.stringify(f.serial)}`);
  for (const [name, v] of [['start', f.start], ['end', f.end]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new RangeError(`${name} must fit a uint32`);
  }
  if (f.end <= f.start) throw new RangeError('end must be after start');
  if (!Number.isInteger(f.bay) || f.bay < 0 || f.bay > 255) throw new RangeError('bay must fit one byte');
  const b = Buffer.alloc(PAYLOAD_LENGTH);
  b.writeUInt8(f.version, 0);
  b.write(f.serial, 1, 4, 'ascii');
  b.writeUInt32LE(f.start, 5);
  b.writeUInt32LE(f.end, 9);
  b.writeUInt8(f.bay, 13);
  return b;
}

export function encodeHireKey(f: Omit<HireKeyFields, 'version'> & { version?: number }, signer: HireKeySigner): Buffer {
  const payload = hireKeyPayload({ version: HIRE_KEY_VERSION, ...f });
  const signature = signer.sign(payload);
  if (signature.length !== 64) throw new Error('Ed25519 signatures are 64 bytes');
  return Buffer.concat([payload, signature]);
}

export function decodeHireKey(key: Uint8Array): HireKeyFields & { signature: Buffer } {
  if (key.length !== HIRE_KEY_LENGTH) throw new RangeError(`A hire key is ${HIRE_KEY_LENGTH} bytes, got ${key.length}`);
  const b = Buffer.from(key);
  return {
    version: b.readUInt8(0),
    serial: b.toString('ascii', 1, 5),
    start: b.readUInt32LE(5),
    end: b.readUInt32LE(9),
    bay: b.readUInt8(13),
    signature: b.subarray(PAYLOAD_LENGTH),
  };
}

/** Raw 32-byte Ed25519 public key as a KeyObject. */
export function publicKeyFromRaw(raw: Uint8Array) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw).toString('base64url') }, format: 'jwk' });
}

/** True if the signature over bytes 0..13 checks against the raw public key. Doesn't check times or serial. */
export function verifyHireKey(key: Uint8Array, publicKeyRaw: Uint8Array): boolean {
  if (key.length !== HIRE_KEY_LENGTH) return false;
  const b = Buffer.from(key);
  return verify(null, b.subarray(0, PAYLOAD_LENGTH), publicKeyFromRaw(publicKeyRaw), b.subarray(PAYLOAD_LENGTH));
}

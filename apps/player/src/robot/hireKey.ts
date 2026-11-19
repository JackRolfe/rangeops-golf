import {
  HIRE_KEY_BODY_LENGTH,
  HIRE_KEY_LENGTH,
  HIRE_KEY_VERSION,
  decodeHireKey,
  encodeHireKey,
  type HireKeyFields,
} from './protocol'

/**
 * The result of checking a hire key, named and ordered as in the firmware
 * (hire_key.h) and robot/tools/hire-key.mjs: the first check that fails wins.
 */
export type HireKeyCheck =
  | 'ok'
  | 'bad_length'
  | 'bad_version'
  | 'bad_signature'
  | 'wrong_serial'
  | 'not_yet'
  | 'expired'

/** Checks a signature over bytes 0..13 of a hire key. */
export interface HireKeyVerifier {
  verify(body: Uint8Array, signature: Uint8Array): Promise<boolean>
}

export interface HireKeySigner {
  sign(body: Uint8Array): Promise<Uint8Array>
}

export interface CheckHireKeyOptions {
  /** The robot's own four serial characters. */
  serial: string
  nowUnix: number
  verifier: HireKeyVerifier
}

/** What a robot does with an Unlock write. Valid while start <= now < end. */
export async function checkHireKey(bytes: Uint8Array, options: CheckHireKeyOptions): Promise<HireKeyCheck> {
  if (bytes.length !== HIRE_KEY_LENGTH) return 'bad_length'
  const key = decodeHireKey(bytes)
  if (!key) return 'bad_length'
  if (key.version !== HIRE_KEY_VERSION) return 'bad_version'
  const body = bytes.subarray(0, HIRE_KEY_BODY_LENGTH)
  if (!(await options.verifier.verify(body, key.signature))) return 'bad_signature'
  if (key.serial !== options.serial) return 'wrong_serial'
  if (options.nowUnix < key.start) return 'not_yet'
  if (options.nowUnix >= key.end) return 'expired'
  return 'ok'
}

/** A copy in a plain ArrayBuffer, which WebCrypto's types insist on. */
const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer

/**
 * Real Ed25519 checking with WebCrypto, against the booking service's public
 * key: what a robot does. Tested against the firmware's shared vectors.
 */
export function ed25519Verifier(publicKey: Uint8Array): HireKeyVerifier {
  let imported: Promise<CryptoKey> | undefined
  return {
    async verify(body, signature) {
      imported ??= crypto.subtle.importKey('raw', buffer(publicKey), { name: 'Ed25519' }, false, ['verify'])
      try {
        return await crypto.subtle.verify({ name: 'Ed25519' }, await imported, buffer(signature), buffer(body))
      } catch {
        return false
      }
    },
  }
}

/**
 * NOT CRYPTOGRAPHIC. A stand-in signature for the simulated robot, so the app
 * can issue keys for it without carrying any signing secret. Anyone can forge
 * one. Real hire keys are signed by the backend with Ed25519.
 */
function benchSignature(body: Uint8Array): Uint8Array {
  const signature = new Uint8Array(64)
  let hash = 0x811c9dc5 // FNV-1a, run on to fill 64 bytes
  for (let index = 0; index < signature.length; index++) {
    for (const byte of body) {
      hash ^= byte
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    hash ^= index
    hash = Math.imul(hash, 0x01000193) >>> 0
    signature[index] = hash & 0xff
  }
  return signature
}

export const benchSigner: HireKeySigner = {
  async sign(body) {
    return benchSignature(body)
  },
}

export const benchVerifier: HireKeyVerifier = {
  async verify(body, signature) {
    const expected = benchSignature(body)
    return signature.length === expected.length && expected.every((byte, index) => byte === signature[index])
  },
}

export type HireWindow = Omit<HireKeyFields, 'version'>

/** A hire key for the simulated robot, signed by the bench signer. */
export async function issueBenchKey(window: HireWindow, signer: HireKeySigner = benchSigner): Promise<Uint8Array> {
  const fields = { version: HIRE_KEY_VERSION, ...window }
  const unsigned = encodeHireKey(fields, new Uint8Array(64))
  return encodeHireKey(fields, await signer.sign(unsigned.subarray(0, HIRE_KEY_BODY_LENGTH)))
}

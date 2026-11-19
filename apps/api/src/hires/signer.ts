import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Signs hire keys. Holds the service's Ed25519 private key and never exposes it. */
export interface HireKeySigner {
  sign(payload: Buffer): Buffer;
  /** The raw 32-byte public key the robot's firmware checks against. */
  readonly publicKey: Buffer;
}

export function signerFromPrivateKey(privateKey: KeyObject): HireKeySigner {
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The hire signing key must be Ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.from(jwk.x!, 'base64url');
  return {
    sign: (payload) => sign(null, payload, privateKey),
    publicKey,
  };
}

export function generateSigner(): HireKeySigner {
  return signerFromPrivateKey(generateKeyPairSync('ed25519').privateKey);
}

/** From a raw 32-byte Ed25519 seed, as the shared test vectors publish theirs. */
export function signerFromSeed(seed: Uint8Array): HireKeySigner {
  if (seed.length !== 32) throw new Error('An Ed25519 seed is 32 bytes');
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed)]);
  return signerFromPrivateKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }));
}

/**
 * Loads the PKCS#8 PEM signing key, or makes one and writes it (mode 600) if
 * there is none. Its folder is gitignored. Returns whether it was created.
 */
export async function loadOrCreateSigner(path: string): Promise<{ signer: HireKeySigner; created: boolean }> {
  try {
    const pem = await readFile(path, 'utf8');
    return { signer: signerFromPrivateKey(createPrivateKey(pem)), created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
  await chmod(path, 0o600);
  return { signer: signerFromPrivateKey(privateKey), created: true };
}

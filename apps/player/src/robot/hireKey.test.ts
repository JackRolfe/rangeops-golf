import { describe, expect, it } from 'vitest'
import vectors from './fixtures/hire_keys.json'
import { benchSigner, benchVerifier, checkHireKey, ed25519Verifier, issueBenchKey } from './hireKey'
import { HIRE_KEY_LENGTH, decodeHireKey } from './protocol'

const fromHex = (hex: string): Uint8Array => new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))

describe('checkHireKey against the shared firmware vectors', () => {
  const verifier = ed25519Verifier(fromHex(vectors.public_key))

  for (const vector of vectors.cases) {
    it(`${vector.name} gives ${vector.expect}`, async () => {
      const result = await checkHireKey(fromHex(vector.key), {
        serial: vectors.robot_serial,
        nowUnix: vector.now,
        verifier,
      })
      expect(result).toBe(vector.expect)
    })
  }
})

describe('bench keys', () => {
  const window = { serial: 'SIM1', bay: 7, start: 1_800_000_000, end: 1_800_003_600 }

  it('are 78-byte keys that pass the bench verifier', async () => {
    const key = await issueBenchKey(window)
    expect(key).toHaveLength(HIRE_KEY_LENGTH)
    expect(decodeHireKey(key)).toMatchObject({ version: 1, ...window })
    expect(await checkHireKey(key, { serial: 'SIM1', nowUnix: 1_800_000_100, verifier: benchVerifier })).toBe('ok')
  })

  it('fail when any byte changes', async () => {
    const key = await issueBenchKey(window)
    for (const index of [0, 3, 8, 13, 14, 50, 77]) {
      const tampered = key.slice()
      tampered[index] ^= 0x10
      const result = await checkHireKey(tampered, { serial: 'SIM1', nowUnix: 1_800_000_100, verifier: benchVerifier })
      expect(result, `byte ${index}`).not.toBe('ok')
    }
  })

  it('are refused for another robot, before the hire and after it', async () => {
    const key = await issueBenchKey(window)
    const check = (serial: string, nowUnix: number) => checkHireKey(key, { serial, nowUnix, verifier: benchVerifier })
    expect(await check('SIM2', 1_800_000_100)).toBe('wrong_serial')
    expect(await check('SIM1', 1_799_999_999)).toBe('not_yet')
    expect(await check('SIM1', 1_800_003_600)).toBe('expired')
  })

  it('are not accepted by a real Ed25519 verifier', async () => {
    const key = await issueBenchKey(window)
    const verifier = ed25519Verifier(fromHex(vectors.public_key))
    expect(await checkHireKey(key, { serial: 'SIM1', nowUnix: 1_800_000_100, verifier })).toBe('bad_signature')
    expect(await benchSigner.sign(new Uint8Array(14))).toHaveLength(64)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { HttpPlayerApi } from './HttpPlayerApi'
import { ApiError } from './PlayerApi'

function respond(status: number, body?: unknown) {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
}

describe('HttpPlayerApi', () => {
  it('sends the bearer token and JSON body, and reads the answer', async () => {
    const fetch = respond(201, { id: 'booking-1' })
    const api = new HttpPlayerApi('http://api.test/', { getToken: () => 'session-1' }, fetch)
    expect(await api.createBooking({ bayId: 'bay-1', startsAt: '2026-12-01T00:00:00.000Z' })).toEqual({ id: 'booking-1' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/bookings')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-1')
    expect(JSON.parse(init.body as string)).toEqual({ bayId: 'bay-1', startsAt: '2026-12-01T00:00:00.000Z' })
  })

  it('turns the API’s error body into an ApiError', async () => {
    const api = new HttpPlayerApi('http://api.test', { getToken: () => 't' }, respond(409, { error: { code: 'bay_taken', message: 'Bay 3 is already booked.' } }))
    await expect(api.createBooking({ bayId: 'b', startsAt: 'x' })).rejects.toMatchObject({ status: 409, code: 'bay_taken', message: 'Bay 3 is already booked.' })
  })

  it('reports a dead session once, and refuses signed-in calls with no token without asking the API', async () => {
    const onUnauthorized = vi.fn()
    const api = new HttpPlayerApi('http://api.test', { getToken: () => 'old', onUnauthorized }, respond(401, { error: { code: 'unauthorized', message: 'Sign in first.' } }))
    await expect(api.getWallet()).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    const fetch = respond(200, {})
    const signedOut = new HttpPlayerApi('http://api.test', { getToken: () => null }, fetch)
    await expect(signedOut.getWallet()).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says when the API can’t be reached', async () => {
    const api = new HttpPlayerApi('http://api.test', { getToken: () => null }, vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(api.listRanges()).rejects.toMatchObject({ status: 0, code: 'network' })
  })

  it('builds a hire-key verifier from the API’s public key, once', async () => {
    const fetch = respond(200, { algorithm: 'Ed25519', hex: '7e21c990bafcd68f6d0f01b62a6795b188cd9077060dfaff082ff78b382e634d', base64: '', keyVersion: 1 })
    const api = new HttpPlayerApi('http://api.test', { getToken: () => null }, fetch)
    const verifier = await api.hireKeyVerifier()
    expect(await verifier.verify(new Uint8Array(14), new Uint8Array(64))).toBe(false)
    await api.hireKeyVerifier()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

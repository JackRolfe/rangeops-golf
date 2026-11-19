import { ed25519Verifier, type HireKeyVerifier } from '../robot/hireKey'
import { hexToBytes } from '../robot/protocol'
import { ApiError, type AuthHooks, type PlayerApi } from './PlayerApi'
import type {
  Availability,
  Booking,
  BookingRequest,
  BucketOrderRequest,
  BucketPurchase,
  CheckIn,
  HireKeyPublicKey,
  Me,
  Order,
  PassOrderRequest,
  PassPurchase,
  Range,
  RangeSummary,
  Session,
  Wallet,
} from './types'

type Fetch = typeof fetch

/** PlayerApi over HTTP, against the RangeOps API at `baseUrl`. */
export class HttpPlayerApi implements PlayerApi {
  readonly mode = 'live' as const
  private readonly baseUrl: string
  private verifier: Promise<HireKeyVerifier> | undefined

  constructor(
    baseUrl: string,
    private readonly auth: AuthHooks,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  listRanges(): Promise<RangeSummary[]> {
    return this.get<{ ranges: RangeSummary[] }>('/ranges').then((body) => body.ranges)
  }

  getRange(rangeId: string): Promise<Range> {
    return this.get(`/ranges/${encodeURIComponent(rangeId)}`)
  }

  getAvailability(rangeId: string, date: string): Promise<Availability> {
    return this.get(`/ranges/${encodeURIComponent(rangeId)}/availability?date=${encodeURIComponent(date)}`)
  }

  async requestSignInLink(email: string): Promise<{ demoLink?: string }> {
    await this.send('POST', '/auth/email-link', { email })
    return {}
  }

  verifySignIn(token: string): Promise<Session> {
    return this.send('POST', '/auth/verify', { token })
  }

  getMe(): Promise<Me> {
    return this.get('/me', true)
  }

  async signOut(): Promise<void> {
    await this.send('POST', '/auth/sign-out', undefined, true)
  }

  createBooking(request: BookingRequest): Promise<Booking> {
    return this.send('POST', '/bookings', request, true)
  }

  listMyBookings(): Promise<Booking[]> {
    return this.get<{ bookings: Booking[] }>('/me/bookings', true).then((body) => body.bookings)
  }

  cancelBooking(bookingId: string): Promise<Booking> {
    return this.send('POST', `/bookings/${encodeURIComponent(bookingId)}/cancel`, undefined, true)
  }

  buyBucket(request: BucketOrderRequest): Promise<BucketPurchase> {
    return this.send('POST', '/orders/buckets', request, true)
  }

  buyPass(request: PassOrderRequest): Promise<PassPurchase> {
    return this.send('POST', '/orders/passes', request, true)
  }

  getWallet(): Promise<Wallet> {
    return this.get('/me/wallet', true)
  }

  listMyOrders(): Promise<Order[]> {
    return this.get<{ orders: Order[] }>('/me/orders', true).then((body) => body.orders)
  }

  checkIn(code: string): Promise<CheckIn> {
    return this.send('POST', `/check-in/${encodeURIComponent(code)}`, undefined, true)
  }

  hireKeyVerifier(): Promise<HireKeyVerifier> {
    this.verifier ??= this.get<HireKeyPublicKey>('/hire-keys/public-key')
      .then((key) => ed25519Verifier(hexToBytes(key.hex)))
      .catch((error: unknown) => {
        this.verifier = undefined
        throw error
      })
    return this.verifier
  }

  private get<T>(path: string, signedIn = false): Promise<T> {
    return this.send('GET', path, undefined, signedIn)
  }

  private async send<T>(method: string, path: string, body?: unknown, signedIn = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (signedIn) {
      const token = this.auth.getToken()
      if (!token) throw new ApiError(401, 'unauthorized', 'Sign in first.')
      headers.Authorization = `Bearer ${token}`
    }
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'network', 'Can’t reach RangeOps. Check your connection and try again.')
    }
    const text = await response.text()
    const json: unknown = text ? safeJson(text) : undefined
    if (!response.ok) {
      const error = (json as { error?: { code?: string; message?: string } } | undefined)?.error
      if (response.status === 401 && signedIn) this.auth.onUnauthorized?.()
      throw new ApiError(response.status, error?.code ?? 'http_error', error?.message ?? `RangeOps answered ${response.status}.`)
    }
    return json as T
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

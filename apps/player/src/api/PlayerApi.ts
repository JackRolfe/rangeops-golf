import type { HireKeyVerifier } from '../robot/hireKey'
import type {
  Availability,
  Booking,
  BookingRequest,
  BucketOrderRequest,
  BucketPurchase,
  CheckIn,
  Me,
  Order,
  PassOrderRequest,
  PassPurchase,
  Range,
  RangeSummary,
  Session,
  Wallet,
} from './types'

/**
 * Everything the app asks of the backend. HttpPlayerApi talks to the RangeOps
 * API; FakePlayerApi keeps it all in memory for tests and for demo mode. Both
 * pass playerApi.contract.ts. Methods marked "signed in" use the session token
 * from `getToken` and fail with a 401 ApiError without one.
 */
export interface PlayerApi {
  /** `live` talks to a real API; `demo` books and charges nothing. */
  readonly mode: 'live' | 'demo'

  listRanges(): Promise<RangeSummary[]>
  /** By id or slug. */
  getRange(rangeId: string): Promise<Range>
  /** Free bays and robots on one local date (YYYY-MM-DD) at the range. */
  getAvailability(rangeId: string, date: string): Promise<Availability>

  /** Sends a sign-in link. In demo mode the link comes back, since nothing is emailed. */
  requestSignInLink(email: string): Promise<{ demoLink?: string }>
  /** Exchanges the token from a link for a session. */
  verifySignIn(token: string): Promise<Session>
  /** Signed in. */
  getMe(): Promise<Me>
  /** Signed in. */
  signOut(): Promise<void>

  /** Signed in. Books and pays in one step. */
  createBooking(request: BookingRequest): Promise<Booking>
  /** Signed in. Newest first. */
  listMyBookings(): Promise<Booking[]>
  /** Signed in. Refunds it. */
  cancelBooking(bookingId: string): Promise<Booking>

  /** Signed in. */
  buyBucket(request: BucketOrderRequest): Promise<BucketPurchase>
  /** Signed in. A monthly pass or a ball credit pack. */
  buyPass(request: PassOrderRequest): Promise<PassPurchase>
  /** Signed in. */
  getWallet(): Promise<Wallet>
  /** Signed in. Newest first. */
  listMyOrders(): Promise<Order[]>

  /** Signed in. The code from a bay's QR link. */
  checkIn(code: string): Promise<CheckIn>

  /** What a robot uses to check this backend's hire keys. */
  hireKeyVerifier(): Promise<HireKeyVerifier>
}

/** An error the API answered with: `{ error: { code, message } }` and its status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Where a client gets the session token, and what it does when the API says it's no good. */
export interface AuthHooks {
  getToken: () => string | null
  onUnauthorized?: () => void
}

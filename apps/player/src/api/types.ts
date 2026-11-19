/**
 * The player-facing shapes of the RangeOps API, written by hand from
 * apps/api/openapi.json. types.test.ts checks every field here against that
 * file, so a change to the API fails a test instead of failing at runtime.
 * Money is in cents of the range's currency; times are ISO instants.
 */

export type AddOnKind = 'robot' | 'club_hire' | 'lesson'

export interface RangeSummary {
  id: string
  slug: string
  name: string
  timeZone: string
  currency: string
}

export interface OpeningHours {
  weekday: number
  opens: string
  closes: string
}

export interface PeakWindow {
  weekday: number
  from: string
  to: string
}

export interface Bay {
  id: string
  rangeId: string
  number: number
  name: string
  active: boolean
  offPeakCentsPerHour: number | null
  peakCentsPerHour: number | null
}

export interface AddOnPrice {
  kind: AddOnKind
  priceCents: number
  unit: 'per_hour' | 'per_booking'
}

export interface BucketProduct {
  id: string
  name: string
  balls: number
  priceCents: number
  active: boolean
}

export interface PassProduct {
  id: string
  kind: 'monthly_pass' | 'ball_credit'
  name: string
  priceCents: number
  days: number | null
  discountPercent: number | null
  balls: number | null
  active: boolean
}

export interface Range extends RangeSummary {
  prices: { offPeakCentsPerHour: number; peakCentsPerHour: number; floorCentsPerHour: number }
  openingHours: OpeningHours[]
  peakWindows: PeakWindow[]
  bays: Bay[]
  addOns: AddOnPrice[]
  bucketProducts: BucketProduct[]
  passProducts: PassProduct[]
}

export interface Slot {
  startsAt: string
  endsAt: string
  localTime: string
  peak: boolean
  priceCents: number
  free: boolean
}

export interface Availability {
  rangeId: string
  date: string
  timeZone: string
  hours: { startsAt: string; localTime: string; robotsFree: number }[]
  bays: { bayId: string; number: number; name: string; slots: Slot[] }[]
}

export interface Account {
  id: string
  email: string
  name: string | null
  createdAt: string
}

export interface Session {
  sessionToken: string
  expiresAt: string
  account: Account
}

export interface Me {
  account: Account
  staffAt: RangeSummary[]
}

export interface Order {
  id: string
  accountId: string | null
  rangeId: string
  kind: 'booking' | 'bucket' | 'pass' | 'ball_credit'
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  totalCents: number
  currency: string
  lines: { description: string; quantity: number; unitCents: number }[]
  paymentProvider: string | null
  failureReason: string | null
  createdAt: string
  paidAt: string | null
  refundedAt: string | null
}

export interface Hire {
  id: string
  status: 'pending' | 'active' | 'cancelled'
  robot: { id: string; serial: string; name: string; bluetoothName: string }
  bayNumber: number
  startsAt: string
  endsAt: string
  key: { hex: string; base64url: string }
  link: string | null
}

export interface Booking {
  id: string
  range: RangeSummary
  bay: { id: string; number: number; name: string }
  accountId: string | null
  source: 'rangeops' | 'external'
  externalRef: string | null
  customerName: string | null
  startsAt: string
  endsAt: string
  hours: number
  status: 'pending_payment' | 'confirmed' | 'cancelled'
  checkedInAt: string | null
  addOns: { kind: AddOnKind; quantity: number; priceCents: number }[]
  totalCents: number
  currency: string
  order: Order | null
  hire: Hire | null
  createdAt: string
  cancelledAt: string | null
}

export interface AddOnRequest {
  kind: AddOnKind
  quantity?: number
}

export interface BookingRequest {
  bayId: string
  startsAt: string
  hours?: number
  addOns?: AddOnRequest[]
  paymentMethod?: string
}

export interface Pass {
  id: string
  range: RangeSummary
  name: string
  discountPercent: number
  validFrom: string
  validTo: string
  orderId: string
}

export interface PassPurchase {
  order: Order
  pass: Pass | null
  ballCredit: number | null
}

export interface PassOrderRequest {
  rangeId: string
  passProductId: string
  paymentMethod: string
}

export interface BucketCode {
  id: string
  code: string
  rangeId: string
  bucket: { productId: string; name: string; balls: number }
  orderId: string
  accountId: string | null
  createdAt: string
  redeemedAt: string | null
  redeemedBy: string | null
}

export interface BucketPurchase {
  order: Order
  bucketCode: BucketCode
}

export type PayWith = { method: 'card'; paymentMethod: string } | { method: 'ball_credit' }

export interface BucketOrderRequest {
  rangeId: string
  bucketProductId: string
  payWith: PayWith
}

export interface Wallet {
  passes: Pass[]
  ballCredit: { range: RangeSummary; balls: number }[]
  bucketCodes: BucketCode[]
}

export interface CheckIn {
  checkedInAt: string
  bay: { id: string; number: number; name: string }
  booking: Booking
  hireLink: string | null
}

export interface HireKeyPublicKey {
  algorithm: 'Ed25519'
  hex: string
  base64: string
  keyVersion: 1
}

/** The fake payment provider's methods: no money moves. */
export const TEST_CARD = 'pm_fake_ok'
export const DECLINED_TEST_CARD = 'pm_fake_declined'

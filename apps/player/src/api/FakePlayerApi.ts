import { addDays, localTime, localParts, weekdayOf, zonedTime } from '../domain/zonedTime'
import { benchVerifier, issueBenchKey, type HireKeyVerifier } from '../robot/hireKey'
import { bytesToBase64url } from '../robot/protocol'
import { ApiError, type AuthHooks, type PlayerApi } from './PlayerApi'
import {
  DECLINED_TEST_CARD,
  TEST_CARD,
  type Account,
  type AddOnKind,
  type Availability,
  type Booking,
  type BookingRequest,
  type BucketCode,
  type BucketOrderRequest,
  type BucketPurchase,
  type CheckIn,
  type Hire,
  type Me,
  type Order,
  type Pass,
  type PassOrderRequest,
  type PassPurchase,
  type Range,
  type RangeSummary,
  type Session,
  type Wallet,
} from './types'

/**
 * PlayerApi in memory: a demo range shaped like the API's seed, with the API's
 * rules and error codes, so screens and tests behave as they will against the
 * real thing. Nothing is emailed, so a sign-in link comes back from
 * `requestSignInLink`. Hire keys are bench-signed (not cryptographic) and the
 * verifier it hands out is the bench one.
 */

const HOUR_MS = 3_600_000
const MAX_HOURS = 4
const MAX_QUANTITY: Record<AddOnKind, number> = { robot: 1, club_hire: 4, lesson: 1 }
const ADDON_NAMES: Record<AddOnKind, string> = { robot: 'Mulligan robot hire', club_hire: 'Club hire', lesson: 'Lesson' }
const EARLY_CHECK_IN_MINUTES = 15

export interface FakePlayerApiOptions {
  auth: AuthHooks
  now?: () => Date
  /** Where links point, like the API's APP_URL. */
  appUrl?: string
}

interface StoredBooking extends Booking {
  robotSerial: string | null
}

let counter = 0
const id = (prefix: string) => `${prefix}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function demoRange(): Range {
  const rangeId = 'range-demo'
  const days = [0, 1, 2, 3, 4, 5, 6]
  return {
    id: rangeId,
    slug: 'demo',
    name: 'RangeOps Demo Range',
    timeZone: 'Australia/Sydney',
    currency: 'AUD',
    prices: { offPeakCentsPerHour: 1800, peakCentsPerHour: 2600, floorCentsPerHour: 1200 },
    openingHours: days.map((weekday) => ({ weekday, opens: '07:00', closes: '22:00' })),
    peakWindows: days.map((weekday) =>
      weekday === 0 || weekday === 6 ? { weekday, from: '08:00', to: '14:00' } : { weekday, from: '16:00', to: '21:00' },
    ),
    bays: Array.from({ length: 8 }, (_, index) => ({
      id: `bay-${index + 1}`,
      rangeId,
      number: index + 1,
      name: `Bay ${index + 1}`,
      active: true,
      offPeakCentsPerHour: null,
      peakCentsPerHour: null,
    })),
    addOns: [
      { kind: 'robot', priceCents: 1500, unit: 'per_hour' },
      { kind: 'club_hire', priceCents: 1000, unit: 'per_booking' },
      { kind: 'lesson', priceCents: 6000, unit: 'per_booking' },
    ],
    bucketProducts: [
      { id: 'bucket-small', name: 'Small bucket', balls: 50, priceCents: 1000, active: true },
      { id: 'bucket-medium', name: 'Medium bucket', balls: 100, priceCents: 1600, active: true },
      { id: 'bucket-large', name: 'Large bucket', balls: 150, priceCents: 2200, active: true },
    ],
    passProducts: [
      { id: 'pass-monthly', kind: 'monthly_pass', name: 'Monthly pass', priceCents: 4900, days: 30, discountPercent: 20, balls: null, active: true },
      { id: 'credit-500', kind: 'ball_credit', name: '500 ball credit', priceCents: 4000, days: null, discountPercent: null, balls: 500, active: true },
    ],
  }
}

const summary = ({ id: rangeId, slug, name, timeZone, currency }: Range): RangeSummary => ({ id: rangeId, slug, name, timeZone, currency })
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const clone = <T>(value: T): T => structuredClone(value)

export class FakePlayerApi implements PlayerApi {
  readonly mode = 'demo' as const
  readonly range = demoRange()
  readonly robots = ['A1B2', 'C3D4']
  private readonly auth: AuthHooks
  private readonly now: () => Date
  private readonly appUrl: string
  private accounts = new Map<string, Account>()
  private links = new Map<string, string>() // token -> email
  private sessions = new Map<string, string>() // session token -> account id
  private bookings: StoredBooking[] = []
  private orders: Order[] = []
  private codes: BucketCode[] = []
  private passes: (Pass & { accountId: string })[] = []
  private credit = new Map<string, number>() // account id -> balls
  /** Bay QR codes, as staff would print them. */
  readonly checkInCodes = new Map(this.range.bays.map((bay) => [`check-in-bay-${bay.number}`, bay.id]))

  constructor(options: FakePlayerApiOptions) {
    this.auth = options.auth
    this.now = options.now ?? (() => new Date())
    this.appUrl = (options.appUrl ?? `${location.origin}${import.meta.env.BASE_URL}`).replace(/\/+$/, '')
  }

  checkInCodeFor(bayNumber: number): string {
    return `check-in-bay-${bayNumber}`
  }

  async listRanges(): Promise<RangeSummary[]> {
    return [summary(this.range)]
  }

  async getRange(rangeId: string): Promise<Range> {
    this.findRange(rangeId)
    return clone(this.range)
  }

  async getAvailability(rangeId: string, date: string): Promise<Availability> {
    const range = this.findRange(rangeId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'bad_request', 'Give a date as YYYY-MM-DD.')
    const hours = this.openHours(date)
    return {
      rangeId: range.id,
      date,
      timeZone: range.timeZone,
      hours: hours.map((startsAt) => ({
        startsAt: startsAt.toISOString(),
        localTime: localTime(startsAt, range.timeZone),
        robotsFree: this.robotsFree(startsAt, new Date(startsAt.getTime() + HOUR_MS)).length,
      })),
      bays: range.bays
        .filter((bay) => bay.active)
        .map((bay) => ({
          bayId: bay.id,
          number: bay.number,
          name: bay.name,
          slots: hours.map((startsAt) => {
            const endsAt = new Date(startsAt.getTime() + HOUR_MS)
            const peak = this.isPeak(startsAt)
            return {
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              localTime: localTime(startsAt, range.timeZone),
              peak,
              priceCents: peak ? range.prices.peakCentsPerHour : range.prices.offPeakCentsPerHour,
              free: !this.bayBusy(bay.id, startsAt, endsAt),
            }
          }),
        })),
    }
  }

  async requestSignInLink(email: string): Promise<{ demoLink?: string }> {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'bad_request', 'That doesn’t look like an email address.')
    const token = id('link')
    this.links.set(token, email.trim().toLowerCase())
    return { demoLink: `${this.appUrl}/signin?token=${token}` }
  }

  async verifySignIn(token: string): Promise<Session> {
    const email = this.links.get(token)
    if (!email) throw new ApiError(401, 'unauthorized', 'That sign-in link is unknown, used or expired. Ask for a new one.')
    this.links.delete(token)
    let account = [...this.accounts.values()].find((item) => item.email === email)
    if (!account) {
      account = { id: id('account'), email, name: null, createdAt: this.now().toISOString() }
      this.accounts.set(account.id, account)
    }
    const sessionToken = id('session')
    this.sessions.set(sessionToken, account.id)
    return { sessionToken, expiresAt: new Date(this.now().getTime() + 30 * 24 * HOUR_MS).toISOString(), account: clone(account) }
  }

  async getMe(): Promise<Me> {
    return { account: clone(this.account()), staffAt: [] }
  }

  async signOut(): Promise<void> {
    const token = this.auth.getToken()
    this.account()
    if (token) this.sessions.delete(token)
  }

  async createBooking(request: BookingRequest): Promise<Booking> {
    const account = this.account()
    const bay = this.range.bays.find((item) => item.id === request.bayId)
    if (!bay) throw new ApiError(404, 'not_found', 'No such bay.')
    if (!bay.active) throw new ApiError(422, 'bay_inactive', `${bay.name} is not taking bookings.`)
    const hours = request.hours ?? 1
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) {
      throw new ApiError(400, 'bad_request', `A booking is 1 to ${MAX_HOURS} hours.`)
    }
    const startsAt = new Date(request.startsAt)
    const endsAt = new Date(startsAt.getTime() + hours * HOUR_MS)
    const { minute } = localParts(startsAt, this.range.timeZone)
    if (minute !== 0 || startsAt.getUTCSeconds() !== 0) throw new ApiError(422, 'not_on_the_hour', 'Bookings start on the hour.')
    if (startsAt.getTime() < this.now().getTime()) throw new ApiError(422, 'in_the_past', 'That time has passed.')
    for (let hour = 0; hour < hours; hour++) {
      const at = new Date(startsAt.getTime() + hour * HOUR_MS)
      if (!this.isOpen(at)) {
        throw new ApiError(422, 'outside_opening_hours', `The range is closed at ${localTime(at, this.range.timeZone)} that day.`)
      }
    }
    const addOns = request.addOns ?? []
    const kinds = new Set<AddOnKind>()
    for (const addOn of addOns) {
      if (kinds.has(addOn.kind)) throw new ApiError(422, 'duplicate_add_on', `Add-on ${addOn.kind} is listed twice.`)
      kinds.add(addOn.kind)
      const quantity = addOn.quantity ?? 1
      if (quantity < 1 || quantity > MAX_QUANTITY[addOn.kind]) {
        throw new ApiError(422, 'bad_quantity', `Add-on ${addOn.kind} can have a quantity of 1 to ${MAX_QUANTITY[addOn.kind]}.`)
      }
      if (!this.range.addOns.some((price) => price.kind === addOn.kind)) {
        throw new ApiError(422, 'add_on_unavailable', `This range doesn't offer ${addOn.kind}.`)
      }
    }
    if (this.bayBusy(bay.id, startsAt, endsAt)) throw new ApiError(409, 'bay_taken', `${bay.name} is already booked for some of that time.`)
    const robotSerial = kinds.has('robot') ? this.robotsFree(startsAt, endsAt)[0] ?? null : null
    if (kinds.has('robot') && !robotSerial) throw new ApiError(409, 'no_robot_free', 'No robot is free for all of that time.')

    const discount = this.passDiscount(account.id)
    const lines: Order['lines'] = []
    for (let hour = 0; hour < hours; hour++) {
      const at = new Date(startsAt.getTime() + hour * HOUR_MS)
      const price = this.isPeak(at) ? this.range.prices.peakCentsPerHour : this.range.prices.offPeakCentsPerHour
      lines.push({ description: `${bay.name}, ${localTime(at, this.range.timeZone)}`, quantity: 1, unitCents: Math.round(price * (1 - discount / 100)) })
    }
    const bookedAddOns = addOns.map((addOn) => {
      const price = this.range.addOns.find((item) => item.kind === addOn.kind)!
      const quantity = addOn.quantity ?? 1
      const priceCents = price.priceCents * quantity * (price.unit === 'per_hour' ? hours : 1)
      lines.push({ description: ADDON_NAMES[addOn.kind], quantity, unitCents: priceCents / quantity })
      return { kind: addOn.kind, quantity, priceCents }
    })
    const order = this.charge(account.id, 'booking', lines, request.paymentMethod)
    const paid = order.status === 'paid'

    const bookingId = id('booking')
    const hire = robotSerial ? await this.hire(robotSerial, bay.number, startsAt, endsAt) : null
    // As the API does: a declined booking is kept, cancelled, with its failed order.
    if (hire) hire.status = paid ? 'active' : 'cancelled'
    const booking: StoredBooking = {
      id: bookingId,
      range: summary(this.range),
      bay: { id: bay.id, number: bay.number, name: bay.name },
      accountId: account.id,
      source: 'rangeops',
      externalRef: null,
      customerName: account.name,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      hours,
      status: paid ? 'confirmed' : 'cancelled',
      checkedInAt: null,
      addOns: bookedAddOns,
      totalCents: order.totalCents,
      currency: this.range.currency,
      order,
      hire,
      createdAt: this.now().toISOString(),
      cancelledAt: paid ? null : this.now().toISOString(),
      robotSerial,
    }
    this.bookings.push(booking)
    if (!paid) throw new ApiError(402, 'payment_declined', order.failureReason!)
    return this.bookingOut(booking)
  }

  async listMyBookings(): Promise<Booking[]> {
    const account = this.account()
    return this.bookings
      .filter((booking) => booking.accountId === account.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((booking) => this.bookingOut(booking))
  }

  async cancelBooking(bookingId: string): Promise<Booking> {
    const account = this.account()
    const booking = this.bookings.find((item) => item.id === bookingId && item.accountId === account.id)
    if (!booking) throw new ApiError(404, 'not_found', 'No such booking.')
    if (booking.status === 'cancelled') throw new ApiError(409, 'already_cancelled', 'That booking is already cancelled.')
    if (new Date(booking.startsAt).getTime() <= this.now().getTime()) {
      throw new ApiError(422, 'already_started', 'This booking has started. Ask the range to cancel it.')
    }
    booking.status = 'cancelled'
    booking.cancelledAt = this.now().toISOString()
    if (booking.hire) booking.hire.status = 'cancelled'
    if (booking.order) {
      booking.order.status = 'refunded'
      booking.order.refundedAt = booking.cancelledAt
    }
    return this.bookingOut(booking)
  }

  async buyBucket(request: BucketOrderRequest): Promise<BucketPurchase> {
    const account = this.account()
    this.findRange(request.rangeId)
    const product = this.range.bucketProducts.find((item) => item.id === request.bucketProductId)
    if (!product) throw new ApiError(404, 'not_found', 'No such bucket at this range.')
    if (!product.active) throw new ApiError(422, 'not_on_sale', `${product.name} is not on sale.`)
    let order: Order
    if (request.payWith.method === 'ball_credit') {
      const balance = this.credit.get(account.id) ?? 0
      if (balance < product.balls) {
        throw new ApiError(409, 'not_enough_credit', `${product.name} needs ${product.balls} balls of credit; you have ${balance}.`)
      }
      this.credit.set(account.id, balance - product.balls)
      order = this.charge(account.id, 'bucket', [{ description: `${product.name}, ${product.balls} balls, from ball credit`, quantity: 1, unitCents: 0 }], undefined)
      this.paidOrThrow(order)
    } else {
      const discount = this.passDiscount(account.id)
      order = this.charge(
        account.id,
        'bucket',
        [{ description: `${product.name}, ${product.balls} balls`, quantity: 1, unitCents: Math.round(product.priceCents * (1 - discount / 100)) }],
        request.payWith.paymentMethod,
      )
      this.paidOrThrow(order)
    }
    const bucketCode: BucketCode = {
      id: id('code'),
      code: String(100000 + Math.floor(Math.random() * 900000)),
      rangeId: this.range.id,
      bucket: { productId: product.id, name: product.name, balls: product.balls },
      orderId: order.id,
      accountId: account.id,
      createdAt: this.now().toISOString(),
      redeemedAt: null,
      redeemedBy: null,
    }
    this.codes.push(bucketCode)
    return { order: clone(order), bucketCode: clone(bucketCode) }
  }

  async buyPass(request: PassOrderRequest): Promise<PassPurchase> {
    const account = this.account()
    this.findRange(request.rangeId)
    const product = this.range.passProducts.find((item) => item.id === request.passProductId)
    if (!product) throw new ApiError(404, 'not_found', 'No such pass at this range.')
    if (!product.active) throw new ApiError(422, 'not_on_sale', `${product.name} is not on sale.`)
    const order = this.charge(account.id, product.kind === 'monthly_pass' ? 'pass' : 'ball_credit', [{ description: product.name, quantity: 1, unitCents: product.priceCents }], request.paymentMethod)
    this.paidOrThrow(order)
    if (product.kind === 'ball_credit') {
      const balance = (this.credit.get(account.id) ?? 0) + (product.balls ?? 0)
      this.credit.set(account.id, balance)
      return { order: clone(order), pass: null, ballCredit: balance }
    }
    // Another pass extends from when the current one ends.
    const current = this.activePasses(account.id).sort((a, b) => b.validTo.localeCompare(a.validTo))[0]
    const validFrom = current ? new Date(current.validTo) : this.now()
    const pass: Pass & { accountId: string } = {
      id: id('pass'),
      range: summary(this.range),
      name: product.name,
      discountPercent: product.discountPercent ?? 0,
      validFrom: validFrom.toISOString(),
      validTo: new Date(validFrom.getTime() + (product.days ?? 30) * 24 * HOUR_MS).toISOString(),
      orderId: order.id,
      accountId: account.id,
    }
    this.passes.push(pass)
    return { order: clone(order), pass: passOut(pass), ballCredit: null }
  }

  async getWallet(): Promise<Wallet> {
    const account = this.account()
    const balls = this.credit.get(account.id) ?? 0
    return {
      passes: this.activePasses(account.id).map(passOut),
      ballCredit: balls ? [{ range: summary(this.range), balls }] : [],
      bucketCodes: this.codes.filter((code) => code.accountId === account.id && !code.redeemedAt).map(clone),
    }
  }

  async listMyOrders(): Promise<Order[]> {
    const account = this.account()
    return this.orders
      .filter((order) => order.accountId === account.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map(clone)
  }

  async checkIn(code: string): Promise<CheckIn> {
    const account = this.account()
    const bayId = this.checkInCodes.get(code)
    if (!bayId) throw new ApiError(404, 'unknown_code', "That QR code isn't a RangeOps bay.")
    const bay = this.range.bays.find((item) => item.id === bayId)!
    const now = this.now().getTime()
    const soon = now + EARLY_CHECK_IN_MINUTES * 60_000
    const booking = this.bookings
      .filter(
        (item) =>
          item.accountId === account.id &&
          item.bay.id === bayId &&
          item.status === 'confirmed' &&
          new Date(item.startsAt).getTime() <= soon &&
          new Date(item.endsAt).getTime() > now,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
    if (!booking) {
      throw new ApiError(404, 'no_booking', `You have no booking at ${bay.name} right now. Check-in opens ${EARLY_CHECK_IN_MINUTES} minutes before.`)
    }
    booking.checkedInAt ??= this.now().toISOString()
    if (booking.hire) booking.hire.status = 'active'
    return {
      checkedInAt: booking.checkedInAt,
      bay: { id: bay.id, number: bay.number, name: bay.name },
      booking: this.bookingOut(booking),
      hireLink: booking.hire?.link ?? null,
    }
  }

  async hireKeyVerifier(): Promise<HireKeyVerifier> {
    return benchVerifier
  }

  // --- internals ---

  private findRange(rangeId: string): Range {
    if (rangeId !== this.range.id && rangeId !== this.range.slug) throw new ApiError(404, 'not_found', 'No such range.')
    return this.range
  }

  private account(): Account {
    const token = this.auth.getToken()
    const accountId = token ? this.sessions.get(token) : undefined
    const account = accountId ? this.accounts.get(accountId) : undefined
    if (!account) {
      if (token) this.auth.onUnauthorized?.()
      throw new ApiError(401, 'unauthorized', 'Sign in first.')
    }
    return account
  }

  private openHours(date: string): Date[] {
    const weekday = weekdayOf(date)
    const hours = this.range.openingHours.find((item) => item.weekday === weekday)
    if (!hours) return []
    const result: Date[] = []
    for (let start = minutes(hours.opens); start + 60 <= minutes(hours.closes); start += 60) {
      result.push(zonedTime(date, `${String(start / 60).padStart(2, '0')}:00`, this.range.timeZone))
    }
    return result
  }

  private isOpen(at: Date): boolean {
    const local = localParts(at, this.range.timeZone)
    const hours = this.range.openingHours.find((item) => item.weekday === local.weekday)
    const start = local.hour * 60 + local.minute
    return !!hours && start >= minutes(hours.opens) && start + 60 <= minutes(hours.closes)
  }

  private isPeak(at: Date): boolean {
    const local = localParts(at, this.range.timeZone)
    const start = local.hour * 60 + local.minute
    return this.range.peakWindows.some((window) => window.weekday === local.weekday && start >= minutes(window.from) && start < minutes(window.to))
  }

  private live(): StoredBooking[] {
    return this.bookings.filter((booking) => booking.status !== 'cancelled')
  }

  private bayBusy(bayId: string, startsAt: Date, endsAt: Date): boolean {
    return this.live().some(
      (booking) => booking.bay.id === bayId && new Date(booking.startsAt) < endsAt && new Date(booking.endsAt) > startsAt,
    )
  }

  private robotsFree(startsAt: Date, endsAt: Date): string[] {
    const busy = new Set(
      this.live()
        .filter((booking) => booking.robotSerial && new Date(booking.startsAt) < endsAt && new Date(booking.endsAt) > startsAt)
        .map((booking) => booking.robotSerial),
    )
    return this.robots.filter((serial) => !busy.has(serial))
  }

  private activePasses(accountId: string): (Pass & { accountId: string })[] {
    const now = this.now().toISOString()
    return this.passes.filter((pass) => pass.accountId === accountId && pass.validTo > now)
  }

  private passDiscount(accountId: string): number {
    const now = this.now().toISOString()
    return Math.max(0, ...this.activePasses(accountId).filter((pass) => pass.validFrom <= now).map((pass) => pass.discountPercent))
  }

  private charge(accountId: string, kind: Order['kind'], lines: Order['lines'], paymentMethod: string | undefined): Order {
    const totalCents = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0)
    if (totalCents > 0 && !paymentMethod) throw new ApiError(400, 'bad_request', 'Give a payment method.')
    const declined = totalCents > 0 && paymentMethod !== TEST_CARD
    const at = this.now().toISOString()
    const order: Order = {
      id: id('order'),
      accountId,
      rangeId: this.range.id,
      kind,
      status: declined ? 'failed' : 'paid',
      totalCents,
      currency: this.range.currency,
      lines,
      paymentProvider: totalCents > 0 ? 'fake' : null,
      failureReason: declined ? (paymentMethod === DECLINED_TEST_CARD ? 'Your card was declined.' : 'Unknown payment method.') : null,
      createdAt: at,
      paidAt: declined ? null : at,
      refundedAt: null,
    }
    this.orders.push(order)
    return order
  }

  private paidOrThrow(order: Order): void {
    if (order.status !== 'paid') throw new ApiError(402, 'payment_declined', order.failureReason ?? 'The payment did not go through.')
  }

  private async hire(serial: string, bay: number, startsAt: Date, endsAt: Date): Promise<Hire> {
    const key = await issueBenchKey({
      serial,
      bay,
      start: Math.floor(startsAt.getTime() / 1000),
      end: Math.floor(endsAt.getTime() / 1000),
    })
    const base64url = bytesToBase64url(key)
    return {
      id: id('hire'),
      status: 'pending',
      robot: { id: `robot-${serial}`, serial, name: `Mulligan ${serial}`, bluetoothName: `Mulligan-${serial}` },
      bayNumber: bay,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      key: { hex: [...key].map((byte) => byte.toString(16).padStart(2, '0')).join(''), base64url },
      link: `${this.appUrl}/drive?hire=${base64url}`,
    }
  }

  private bookingOut(booking: StoredBooking): Booking {
    const { robotSerial: _robotSerial, ...out } = booking
    return clone(out)
  }
}

function passOut({ accountId: _accountId, ...pass }: Pass & { accountId: string }): Pass {
  return clone(pass)
}

/** Midnight-free helper for tests and screens: tomorrow's local date at a range. */
export function tomorrowAt(timeZone: string, now = new Date()): string {
  const { year, month, day } = localParts(now, timeZone)
  return addDays(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 1)
}

// Behaviour every PlayerApi has, whatever is behind it. FakePlayerApi runs it in
// FakePlayerApi.test.ts; HttpPlayerApi.live.test.ts runs it against a real API.
import { describe, expect, it } from 'vitest'
import { checkHireKey } from '../robot/hireKey'
import { base64urlToBytes, decodeHireKey, HIRE_KEY_LENGTH } from '../robot/protocol'
import { addDays, localDate } from '../domain/zonedTime'
import { ApiError, type PlayerApi } from './PlayerApi'
import { DECLINED_TEST_CARD, TEST_CARD, type Availability, type Range } from './types'

export interface ContractSubject {
  api: PlayerApi
  /** Signs in as a fresh account, by whatever way this API hands out links. */
  signIn: () => Promise<void>
  signOut: () => void
  /** A bay's check-in code, where the test can know one. */
  checkInCode?: (bayNumber: number) => Promise<string>
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected the API to refuse.')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

/** A bay and hour free for `hours` hours, some days out so live runs don't collide. */
async function freeSlot(api: PlayerApi, range: Range, hours = 1, daysOut = 3): Promise<{ bayId: string; startsAt: string; availability: Availability }> {
  for (let day = daysOut; day < daysOut + 20; day++) {
    const date = addDays(localDate(new Date(), range.timeZone), day)
    const availability = await api.getAvailability(range.slug, date)
    const shuffled = [...availability.bays].sort(() => Math.random() - 0.5)
    for (const bay of shuffled) {
      for (let index = 0; index + hours <= bay.slots.length; index++) {
        const run = bay.slots.slice(index, index + hours)
        const robots = availability.hours.slice(index, index + hours)
        if (run.every((slot) => slot.free) && robots.every((hour) => hour.robotsFree > 0)) {
          return { bayId: bay.bayId, startsAt: run[0].startsAt, availability }
        }
      }
    }
  }
  throw new Error('No free slot in the next three weeks.')
}

export function playerApiContract(name: string, make: () => ContractSubject) {
  describe(`${name} meets the PlayerApi contract`, () => {
    it('lists ranges and gives one by slug, with bays, add-ons, buckets and passes', async () => {
      const { api } = make()
      const ranges = await api.listRanges()
      expect(ranges.length).toBeGreaterThan(0)
      const range = await api.getRange(ranges[0].slug)
      expect(range.id).toBe(ranges[0].id)
      expect(range.bays.length).toBeGreaterThan(0)
      expect(range.addOns.map((addOn) => addOn.kind)).toContain('robot')
      expect(range.bucketProducts.length).toBeGreaterThan(0)
      expect(range.passProducts.map((pass) => pass.kind).sort()).toEqual(expect.arrayContaining(['ball_credit', 'monthly_pass']))
    })

    it('gives hour-by-hour availability for every bay on a local date', async () => {
      const { api } = make()
      const [summary] = await api.listRanges()
      const date = addDays(localDate(new Date(), summary.timeZone), 2)
      const availability = await api.getAvailability(summary.slug, date)
      expect(availability.date).toBe(date)
      expect(availability.hours.length).toBeGreaterThan(0)
      for (const bay of availability.bays) expect(bay.slots).toHaveLength(availability.hours.length)
      expect(availability.hours.map((hour) => hour.startsAt)).toEqual(availability.bays[0].slots.map((slot) => slot.startsAt))
    })

    it('refuses an unknown sign-in link and signed-out requests with 401', async () => {
      const { api } = make()
      expect((await rejection(api.verifySignIn('not-a-real-token'))).status).toBe(401)
      expect((await rejection(api.listMyBookings())).status).toBe(401)
    })

    it('books a bay with a robot, with a hire key for that robot and hour, then cancels it', async () => {
      const subject = make()
      const { api } = subject
      await subject.signIn()
      expect((await api.getMe()).account.email).toContain('@')
      const range = await api.getRange((await api.listRanges())[0].slug)
      const slot = await freeSlot(api, range)
      const booking = await api.createBooking({
        bayId: slot.bayId,
        startsAt: slot.startsAt,
        hours: 1,
        addOns: [{ kind: 'robot' }],
        paymentMethod: TEST_CARD,
      })
      expect(booking.status).toBe('confirmed')
      expect(booking.hire?.status).toBe('active')
      expect(booking.order?.status).toBe('paid')
      expect(booking.totalCents).toBeGreaterThan(0)
      const key = base64urlToBytes(booking.hire!.key.base64url)!
      expect(key).toHaveLength(HIRE_KEY_LENGTH)
      const fields = decodeHireKey(key)!
      expect(fields.serial).toBe(booking.hire!.robot.serial)
      expect(fields.bay).toBe(booking.bay.number)
      expect(fields.start).toBe(Date.parse(booking.startsAt) / 1000)
      expect(booking.hire!.link).toMatch(/\/drive\?hire=/)
      const verifier = await api.hireKeyVerifier()
      expect(await checkHireKey(key, { serial: fields.serial, nowUnix: fields.start + 60, verifier })).toBe('ok')

      expect((await api.listMyBookings()).map((item) => item.id)).toContain(booking.id)
      const again = await rejection(
        api.createBooking({ bayId: slot.bayId, startsAt: slot.startsAt, hours: 1, paymentMethod: TEST_CARD }),
      )
      expect([again.status, again.code]).toEqual([409, 'bay_taken'])

      const cancelled = await api.cancelBooking(booking.id)
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.order?.status).toBe('refunded')
      expect((await rejection(api.cancelBooking(booking.id))).code).toBe('already_cancelled')
    })

    it('says so when the card is declined, and books nothing', async () => {
      const subject = make()
      await subject.signIn()
      const { api } = subject
      const range = await api.getRange((await api.listRanges())[0].slug)
      const slot = await freeSlot(api, range, 1, 5)
      const declined = await rejection(api.createBooking({ bayId: slot.bayId, startsAt: slot.startsAt, paymentMethod: DECLINED_TEST_CARD }))
      expect([declined.status, declined.code]).toEqual([402, 'payment_declined'])
      // The API keeps it, cancelled, with its failed order.
      const kept = await api.listMyBookings()
      expect(kept.filter((booking) => booking.status !== 'cancelled')).toEqual([])
      expect(kept.every((booking) => booking.order?.status === 'failed')).toBe(true)
      const free = await api.getAvailability(range.slug, slot.availability.date)
      expect(free.bays.find((bay) => bay.bayId === slot.bayId)?.slots.find((s) => s.startsAt === slot.startsAt)?.free).toBe(true)
    })

    it('sells ball credit, spends it on a bucket with a code, and refuses when it runs short', async () => {
      const subject = make()
      await subject.signIn()
      const { api } = subject
      const range = await api.getRange((await api.listRanges())[0].slug)
      const pack = range.passProducts.find((product) => product.kind === 'ball_credit')!
      const bought = await api.buyPass({ rangeId: range.id, passProductId: pack.id, paymentMethod: TEST_CARD })
      expect(bought.ballCredit).toBe(pack.balls)
      const bucket = [...range.bucketProducts].filter((product) => product.active).sort((a, b) => a.balls - b.balls)[0]
      const purchase = await api.buyBucket({ rangeId: range.id, bucketProductId: bucket.id, payWith: { method: 'ball_credit' } })
      expect(purchase.bucketCode.code).toMatch(/\S/)
      expect(purchase.order.totalCents).toBe(0)
      const wallet = await api.getWallet()
      expect(wallet.bucketCodes.map((code) => code.code)).toContain(purchase.bucketCode.code)
      expect(wallet.ballCredit.find((credit) => credit.range.id === range.id)?.balls).toBe(pack.balls! - bucket.balls)

      const biggest = [...range.bucketProducts].filter((product) => product.active).sort((a, b) => b.balls - a.balls)[0]
      let short = pack.balls! - bucket.balls
      while (short >= biggest.balls) {
        await api.buyBucket({ rangeId: range.id, bucketProductId: biggest.id, payWith: { method: 'ball_credit' } })
        short -= biggest.balls
      }
      expect((await rejection(api.buyBucket({ rangeId: range.id, bucketProductId: biggest.id, payWith: { method: 'ball_credit' } }))).code).toBe('not_enough_credit')
      expect((await api.listMyOrders()).length).toBeGreaterThan(1)
    })

    it('sells a monthly pass that shows in the wallet', async () => {
      const subject = make()
      await subject.signIn()
      const { api } = subject
      const range = await api.getRange((await api.listRanges())[0].slug)
      const monthly = range.passProducts.find((product) => product.kind === 'monthly_pass')!
      const bought = await api.buyPass({ rangeId: range.id, passProductId: monthly.id, paymentMethod: TEST_CARD })
      expect(bought.pass?.discountPercent).toBe(monthly.discountPercent)
      expect((await api.getWallet()).passes.map((pass) => pass.id)).toContain(bought.pass!.id)
    })

    it('refuses a check-in code that is not a bay, and one with no booking now', async () => {
      const subject = make()
      await subject.signIn()
      expect((await rejection(subject.api.checkIn('not-a-bay-code'))).code).toBe('unknown_code')
      if (subject.checkInCode) {
        expect((await rejection(subject.api.checkIn(await subject.checkInCode(8)))).code).toBe('no_booking')
      }
    })

    it('ends the session on sign-out', async () => {
      const subject = make()
      await subject.signIn()
      await subject.api.signOut()
      expect((await rejection(subject.api.getMe())).status).toBe(401)
      subject.signOut()
    })
  })
}

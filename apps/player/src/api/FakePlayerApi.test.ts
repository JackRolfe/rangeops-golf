import { describe, expect, it } from 'vitest'
import { FakePlayerApi } from './FakePlayerApi'
import { playerApiContract } from './playerApi.contract'
import { TEST_CARD } from './types'

function fakeSubject() {
  let token: string | null = null
  const api = new FakePlayerApi({ auth: { getToken: () => token }, appUrl: 'http://localhost/app' })
  return {
    api,
    async signIn() {
      const { demoLink } = await api.requestSignInLink(`player-${Math.random().toString(36).slice(2)}@example.test`)
      const linkToken = new URL(demoLink!).searchParams.get('token')!
      token = (await api.verifySignIn(linkToken)).sessionToken
    },
    signOut() {
      token = null
    },
    async checkInCode(bayNumber: number) {
      return api.checkInCodeFor(bayNumber)
    },
  }
}

playerApiContract('FakePlayerApi', fakeSubject)

describe('FakePlayerApi beyond the contract', () => {
  it('checks in to a booking that starts within 15 minutes and hands back its hire link', async () => {
    let now = new Date('2026-12-02T01:00:00.000Z') // 12:00 in Sydney
    let token: string | null = null
    const api = new FakePlayerApi({ auth: { getToken: () => token }, now: () => now, appUrl: 'http://localhost/app' })
    const { demoLink } = await api.requestSignInLink('kid@example.test')
    token = (await api.verifySignIn(new URL(demoLink!).searchParams.get('token')!)).sessionToken
    const booking = await api.createBooking({
      bayId: 'bay-3',
      startsAt: '2026-12-02T02:00:00.000Z',
      addOns: [{ kind: 'robot' }],
      paymentMethod: TEST_CARD,
    })
    await expect(api.checkIn(api.checkInCodeFor(3))).rejects.toMatchObject({ code: 'no_booking' })
    now = new Date('2026-12-02T01:50:00.000Z')
    const checkIn = await api.checkIn(api.checkInCodeFor(3))
    expect(checkIn.booking.id).toBe(booking.id)
    expect(checkIn.hireLink).toBe(booking.hire!.link)
    expect(checkIn.bay.number).toBe(3)
  })

  it('takes a pass discount off bay-hours, and refuses a second robot when both are out', async () => {
    let token: string | null = null
    const now = new Date('2026-12-02T01:00:00.000Z')
    const api = new FakePlayerApi({ auth: { getToken: () => token }, now: () => now, appUrl: 'http://localhost/app' })
    const { demoLink } = await api.requestSignInLink('parent@example.test')
    token = (await api.verifySignIn(new URL(demoLink!).searchParams.get('token')!)).sessionToken
    await api.buyPass({ rangeId: 'demo', passProductId: 'pass-monthly', paymentMethod: TEST_CARD })
    const startsAt = '2026-12-03T00:00:00.000Z' // 11:00 Thursday, off-peak
    const first = await api.createBooking({ bayId: 'bay-1', startsAt, addOns: [{ kind: 'robot' }], paymentMethod: TEST_CARD })
    expect(first.totalCents).toBe(1800 * 0.8 + 1500)
    await api.createBooking({ bayId: 'bay-2', startsAt, addOns: [{ kind: 'robot' }], paymentMethod: TEST_CARD })
    await expect(
      api.createBooking({ bayId: 'bay-3', startsAt, addOns: [{ kind: 'robot' }], paymentMethod: TEST_CARD }),
    ).rejects.toMatchObject({ status: 409, code: 'no_robot_free' })
    const availability = await api.getAvailability('demo', '2026-12-03')
    expect(availability.hours.find((hour) => hour.startsAt === startsAt)?.robotsFree).toBe(0)
  })
})

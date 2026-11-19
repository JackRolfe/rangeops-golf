import { describe, expect, it } from 'vitest'
import type { PracticeSession, Shot } from './types'
import {
  MIN_SHOTS_FOR_BEST,
  filterSessionsByClub,
  getBestSession,
  getLastNAccuracy,
  getOverallAccuracy,
  getRecentShots,
  getSessionAccuracy,
  getSessionTrend,
} from './metrics'

const dimensions = { width: 1000, height: 1000 }
const resolveRange = () => dimensions

function shot(index: number, onTarget: boolean, base = Date.UTC(2026, 0, 1)): Shot {
  return {
    id: `shot-${index}`,
    x: onTarget ? 0.5 : 0.9,
    y: 0.5,
    radius: 0.1,
    recordedAt: new Date(base + index * 1000).toISOString(),
  }
}

function session(
  id: string,
  club: string,
  shots: Shot[],
  options: { status?: 'draft' | 'completed'; completedAt?: string; revision?: number } = {},
): PracticeSession {
  const status = options.status ?? 'completed'
  const completedAt =
    options.completedAt ?? new Date(Date.UTC(2026, 0, 2) + Number(id.replace(/\D/g, '') || 0) * 1000).toISOString()
  return {
    id,
    rangeId: 'range-1',
    rangeRevision: options.revision ?? 1,
    mode: 'bullseye',
    club,
    note: '',
    target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    targetLocked: shots.length > 0,
    shots,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: completedAt,
    completedAt: status === 'completed' ? completedAt : null,
  }
}

describe('accuracy metrics', () => {
  it('returns zeros for empty data', () => {
    expect(getOverallAccuracy([], resolveRange)).toEqual({
      onTarget: 0,
      total: 0,
      percentage: 0,
    })
    expect(getLastNAccuracy([], resolveRange, 30)).toEqual({
      onTarget: 0,
      total: 0,
      percentage: 0,
    })
    expect(getSessionTrend([], resolveRange)).toEqual([])
  })

  it('calculates session and overall percentages while excluding drafts', () => {
    const completed = session('session-1', '7 iron', [shot(1, true), shot(2, false)])
    const draft = session('session-2', '7 iron', [shot(3, true)], { status: 'draft' })

    expect(getSessionAccuracy(completed, dimensions)).toEqual({
      onTarget: 1,
      total: 2,
      percentage: 50,
    })
    expect(getOverallAccuracy([completed, draft], resolveRange)).toEqual({
      onTarget: 1,
      total: 2,
      percentage: 50,
    })
  })

  it('selects the latest 30 shots globally, then returns them chronologically', () => {
    const allShots = Array.from({ length: 40 }, (_, index) => shot(index, index % 10 === 0))
    const sessions = [
      session('session-1', 'Driver', allShots.slice(0, 20)),
      session('session-2', 'Driver', allShots.slice(20)),
    ]

    const recent = getRecentShots(sessions, 30)
    expect(recent).toHaveLength(30)
    expect(recent[0].shot.id).toBe('shot-10')
    expect(recent[recent.length - 1]?.shot.id).toBe('shot-39')
    expect(getLastNAccuracy(sessions, resolveRange, 30)).toEqual({
      onTarget: 3,
      total: 30,
      percentage: 10,
    })
  })

  it('filters clubs case-insensitively and treats all as unfiltered', () => {
    const sessions = [
      session('session-1', '7 Iron', []),
      session('session-2', 'Driver', []),
      session('session-3', '7 iron', []),
    ]

    expect(filterSessionsByClub(sessions, ' 7 IRON ')).toHaveLength(2)
    expect(filterSessionsByClub(sessions, 'driver').map(({ id }) => id)).toEqual([
      'session-2',
    ])
    expect(filterSessionsByClub(sessions, 'all')).toHaveLength(3)
    expect(filterSessionsByClub(sessions, null)).toHaveLength(3)
  })

  it('sorts per-session trend by completion and applies its club filter', () => {
    const later = session('session-2', 'Driver', [shot(2, true)], {
      completedAt: '2026-02-03T00:00:00.000Z',
    })
    const earlier = session('session-1', 'Driver', [shot(1, false)], {
      completedAt: '2026-02-01T00:00:00.000Z',
    })
    const otherClub = session('session-3', 'Wedge', [shot(3, true)], {
      completedAt: '2026-02-02T00:00:00.000Z',
    })

    const trend = getSessionTrend([later, otherClub, earlier], resolveRange, 'driver')
    expect(trend.map(({ sessionId }) => sessionId)).toEqual(['session-1', 'session-2'])
    expect(trend.map(({ percentage }) => percentage)).toEqual([0, 100])
  })

  it('uses the dimensions for each historical range revision', () => {
    const landscapeSession = session('session-1', 'Driver', [
      { ...shot(1, true), x: 0.575 },
    ])
    const squareSession = session(
      'session-2',
      'Driver',
      [{ ...shot(2, true), x: 0.575 }],
      { revision: 2 },
    )
    const resolver = (_id: string, revision: number) =>
      revision === 1 ? { width: 2000, height: 1000 } : { width: 1000, height: 1000 }

    expect(getOverallAccuracy([landscapeSession, squareSession], resolver)).toEqual({
      onTarget: 1,
      total: 2,
      percentage: 50,
    })
  })
})

describe('Shrink the Ring sessions', () => {
  it('judges each shot against the ring it was played at', () => {
    // 0.09 from the centre: on target at the starting ring, a miss once it shrinks.
    const edge = (index: number, radius: number): Shot => ({ ...shot(index, true), x: 0.59, radius })
    const shrink = { ...session('session-1', 'Driver', [edge(1, 0.1), edge(2, 0.1), edge(3, 0.1), edge(4, 0.08)]), mode: 'shrink' as const }
    expect(getSessionAccuracy(shrink, dimensions)).toEqual({ onTarget: 3, total: 4, percentage: 75 })
  })
})

describe('getBestSession (Beat Your Best)', () => {
  const shots = (on: number, total: number): Shot[] =>
    Array.from({ length: total }, (_, index) => shot(index, index < on))
  const at = (day: number) => new Date(Date.UTC(2026, 1, day)).toISOString()
  const history: PracticeSession[] = [
    session('s1', '7 iron', shots(3, 5), { completedAt: at(1) }),
    session('s2', '7 Iron ', shots(4, 5), { completedAt: at(2) }),
    session('s3', '7 iron', shots(8, 10), { completedAt: at(3) }), // ties s2 at 80%
    session('s4', '7 iron', shots(3, 3), { completedAt: at(4) }), // 100% but too few shots
    session('s5', 'Driver', shots(5, 5), { completedAt: at(5) }),
    { ...session('s6', '7 iron', shots(5, 5), { completedAt: at(6) }), mode: 'shrink' },
    session('s7', '7 iron', shots(5, 5), { status: 'draft' }),
  ]

  it('needs at least five shots for a session to count', () => {
    expect(MIN_SHOTS_FOR_BEST).toBe(5)
  })

  it('finds the best completed session for the club and game, earliest on a tie', () => {
    expect(getBestSession(history, resolveRange, { club: '7 IRON', mode: 'bullseye' })).toMatchObject({
      sessionId: 's2',
      onTarget: 4,
      total: 5,
      percentage: 80,
    })
    expect(getBestSession(history, resolveRange, { club: '7 iron', mode: 'shrink' })?.sessionId).toBe('s6')
    expect(getBestSession(history, resolveRange, { club: 'Driver', mode: 'bullseye' })?.sessionId).toBe('s5')
    expect(getBestSession(history, resolveRange, { club: 'Wedge', mode: 'bullseye' })).toBeNull()
  })

  it('can leave a session out and look only at sessions finished before a time', () => {
    expect(getBestSession(history, resolveRange, { club: '7 iron', mode: 'bullseye', excludeSessionId: 's2' })?.sessionId).toBe('s3')
    expect(getBestSession(history, resolveRange, { club: '7 iron', mode: 'bullseye', before: at(2) })?.sessionId).toBe('s1')
    expect(getBestSession(history, resolveRange, { club: '7 iron', mode: 'bullseye', before: at(1) })).toBeNull()
  })
})

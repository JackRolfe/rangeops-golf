import { describe, expect, it } from 'vitest'
import type { PracticeSession, Shot } from './types'
import {
  filterSessionsByClub,
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

import { shotTarget, type GameMode } from './games'
import { isShotOnTarget } from './geometry'
import type {
  ImageDimensions,
  PracticeSession,
  RangeMap,
  Shot,
} from './types'

export interface AccuracySummary {
  onTarget: number
  total: number
  /** Percentage in the inclusive range 0–100. Empty sets return 0. */
  percentage: number
}

export interface SessionTrendPoint extends AccuracySummary {
  sessionId: string
  club: string
  recordedAt: string
}

export interface ShotWithSession {
  shot: Shot
  session: PracticeSession
}

export type RangeResolver = (
  rangeId: string,
  revision: number,
) => ImageDimensions | undefined

export type RangeSource = RangeMap | readonly RangeMap[] | RangeResolver

const completedOnly = (sessions: readonly PracticeSession[]): PracticeSession[] =>
  sessions.filter((session) => session.status === 'completed')

function compareTimestamps(first: string, second: string): number {
  return first.localeCompare(second)
}

function resolveDimensions(
  source: RangeSource,
  session: PracticeSession,
): ImageDimensions | undefined {
  if (typeof source === 'function') {
    return source(session.rangeId, session.rangeRevision)
  }

  if (Array.isArray(source)) {
    return source.find(
      (range) => range.id === session.rangeId && range.revision === session.rangeRevision,
    )
  }

  const range = source as RangeMap
  return range.id === session.rangeId && range.revision === session.rangeRevision
    ? range
    : undefined
}

function requireDimensions(source: RangeSource, session: PracticeSession): ImageDimensions {
  const dimensions = resolveDimensions(source, session)
  if (!dimensions) {
    throw new Error(
      `Missing range map ${session.rangeId} revision ${session.rangeRevision} for session ${session.id}.`,
    )
  }
  return dimensions
}

export function accuracySummary(onTarget: number, total: number): AccuracySummary {
  return {
    onTarget,
    total,
    percentage: total === 0 ? 0 : (onTarget / total) * 100,
  }
}

export function getSessionAccuracy(
  session: PracticeSession,
  dimensions: ImageDimensions,
): AccuracySummary {
  const onTarget = session.shots.reduce(
    (count, shot) => count + Number(isShotOnTarget(shot, shotTarget(session.target, shot), dimensions)),
    0,
  )
  return accuracySummary(onTarget, session.shots.length)
}

/** Aggregate completed sessions. Draft shots intentionally do not affect progress. */
export function getOverallAccuracy(
  sessions: readonly PracticeSession[],
  ranges: RangeSource,
): AccuracySummary {
  let onTarget = 0
  let total = 0

  for (const session of completedOnly(sessions)) {
    const summary = getSessionAccuracy(session, requireDimensions(ranges, session))
    onTarget += summary.onTarget
    total += summary.total
  }

  return accuracySummary(onTarget, total)
}

/**
 * Return the newest `limit` completed shots, in ascending chronological order.
 * Ascending output makes the result suitable for a progress timeline while the
 * slice still selects the most recent shots globally across sessions.
 */
export function getRecentShots(
  sessions: readonly PracticeSession[],
  limit: number,
): ShotWithSession[] {
  if (!Number.isFinite(limit) || limit <= 0) return []

  return completedOnly(sessions)
    .flatMap((session) => session.shots.map((shot) => ({ session, shot })))
    .sort((first, second) => {
      const time = compareTimestamps(first.shot.recordedAt, second.shot.recordedAt)
      if (time !== 0) return time
      const session = first.session.id.localeCompare(second.session.id)
      return session !== 0 ? session : first.shot.id.localeCompare(second.shot.id)
    })
    .slice(-Math.floor(limit))
}

export function getLastNAccuracy(
  sessions: readonly PracticeSession[],
  ranges: RangeSource,
  limit = 30,
): AccuracySummary {
  const recent = getRecentShots(sessions, limit)
  const onTarget = recent.reduce((count, { session, shot }) => {
    const dimensions = requireDimensions(ranges, session)
    return count + Number(isShotOnTarget(shot, shotTarget(session.target, shot), dimensions))
  }, 0)
  return accuracySummary(onTarget, recent.length)
}

/** Case-insensitive club filtering; blank and "all" mean no filter. */
export function filterSessionsByClub(
  sessions: readonly PracticeSession[],
  club: string | null | undefined,
): PracticeSession[] {
  const normalizedClub = club?.trim().toLocaleLowerCase()
  if (!normalizedClub || normalizedClub === 'all') return [...sessions]
  return sessions.filter(
    (session) => session.club.trim().toLocaleLowerCase() === normalizedClub,
  )
}

export function getSessionTrend(
  sessions: readonly PracticeSession[],
  ranges: RangeSource,
  club?: string | null,
): SessionTrendPoint[] {
  return completedOnly(filterSessionsByClub(sessions, club))
    .sort((first, second) => {
      const firstTime = first.completedAt ?? first.updatedAt
      const secondTime = second.completedAt ?? second.updatedAt
      const time = compareTimestamps(firstTime, secondTime)
      return time !== 0 ? time : first.id.localeCompare(second.id)
    })
    .map((session) => ({
      sessionId: session.id,
      club: session.club,
      recordedAt: session.completedAt ?? session.updatedAt,
      ...getSessionAccuracy(session, requireDimensions(ranges, session)),
    }))
}

// Compact aliases for consumers that prefer calculation-style names.
export const calculateSessionAccuracy = getSessionAccuracy
export const calculateOverallAccuracy = getOverallAccuracy
export const calculateLastNAccuracy = getLastNAccuracy
export const calculateTrend = getSessionTrend

/** A session needs this many shots before its score can be the one to beat. */
export const MIN_SHOTS_FOR_BEST = 5

export interface BestSession extends AccuracySummary {
  sessionId: string
  club: string
  mode: GameMode
  recordedAt: string
}

export interface BestSessionQuery {
  club: string
  mode: GameMode
  /** Leave this session out, usually the one being played. */
  excludeSessionId?: string
  /** Only sessions completed strictly before this time. */
  before?: string
}

/**
 * Beat Your Best: the completed session with the highest accuracy for a club
 * and game. Sessions under MIN_SHOTS_FOR_BEST shots don't count, so one lucky
 * shot can't set an unbeatable 100%. Ties go to the earlier session.
 */
export function getBestSession(
  sessions: readonly PracticeSession[],
  ranges: RangeSource,
  query: BestSessionQuery,
): BestSession | null {
  let best: BestSession | null = null
  for (const point of getSessionTrend(
    sessions.filter(
      (session) =>
        session.mode === query.mode &&
        session.id !== query.excludeSessionId &&
        session.shots.length >= MIN_SHOTS_FOR_BEST,
    ),
    ranges,
    query.club,
  )) {
    if (query.before !== undefined && point.recordedAt >= query.before) continue
    if (!best || point.percentage > best.percentage) best = { ...point, mode: query.mode }
  }
  return best
}

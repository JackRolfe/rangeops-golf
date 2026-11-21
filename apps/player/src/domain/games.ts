import { isShotOnTarget } from './geometry'
import type { ImageDimensions, Target } from './types'

/**
 * The games a practice session can be played as.
 *
 * - `bullseye`: one fixed ring for the whole session. This is what the app did
 *   before games existed, so every older session is a bullseye session.
 * - `shrink`: Shrink the Ring. Three on-target shots in a row shrink the ring.
 */
export type GameMode = 'bullseye' | 'shrink'

export const GAME_MODES: readonly GameMode[] = ['bullseye', 'shrink']

export const GAME_NAMES: Readonly<Record<GameMode, string>> = {
  bullseye: 'Bullseye',
  shrink: 'Shrink the Ring',
}

/** Hits in a row needed to shrink the ring. */
export const SHRINK_STREAK = 3
/** Each shrink multiplies the radius by this: the ring loses a fifth. */
export const SHRINK_FACTOR = 0.8
/** The ring never gets smaller than this share of the starting ring. */
export const SHRINK_FLOOR_RATIO = 1 / 3

export interface RingState {
  /** Ring radius for the next shot, in the same units as the start radius. */
  radius: number
  /** On-target shots in a row, ending with the latest shot. */
  streak: number
  onTarget: number
  /** How many times the ring has shrunk. */
  shrinks: number
  /** The smallest ring reached; equals `radius` because the ring never grows. */
  minRadius: number
}

export function isGameMode(value: unknown): value is GameMode {
  return value === 'bullseye' || value === 'shrink'
}

/**
 * Replay a game from its hits and misses, in order, and return the ring for
 * the next shot. Ported from `replay()` in the site demo (`apps/site/index.html`),
 * which starts at 36 and floors at 12.
 */
export function playRing(mode: GameMode, startRadius: number, hits: readonly boolean[]): RingState {
  const floor = startRadius * SHRINK_FLOOR_RATIO
  let radius = startRadius
  let streak = 0
  let onTarget = 0
  let shrinks = 0

  for (const hit of hits) {
    if (!hit) {
      streak = 0
      continue
    }
    onTarget++
    streak++
    if (mode === 'shrink' && streak % SHRINK_STREAK === 0) {
      const next = Math.max(floor, radius * SHRINK_FACTOR)
      if (next < radius) shrinks++
      radius = next
    }
  }

  return { radius, streak, onTarget, shrinks, minRadius: radius }
}

export interface RingShot {
  x: number
  y: number
  /** The ring radius in force when the shot was played. Older shots may lack it. */
  radius?: number
}

export interface RingSession {
  mode: GameMode
  target: Target
  shots: readonly RingShot[]
}

/** The ring a shot was played against: the session's centre, the shot's radius. */
export function shotTarget(target: Target, shot: RingShot): Target {
  return { ...target, radius: shot.radius ?? target.radius }
}

/** Judge every recorded shot against its own ring and return the ring for the next one. */
export function ringForNextShot(session: RingSession, dimensions: ImageDimensions): RingState {
  const hits = session.shots.map((shot) => isShotOnTarget(shot, shotTarget(session.target, shot), dimensions))
  return playRing(session.mode, session.target.radius, hits)
}

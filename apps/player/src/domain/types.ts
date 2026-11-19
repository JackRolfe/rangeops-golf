import type { GameMode } from './games'

export type { GameMode } from './games'

/** An ISO-8601 timestamp. Timestamps are strings so records remain portable. */
export type ISODateString = string

export interface ImageDimensions {
  width: number
  height: number
}

/**
 * A persisted range image revision.
 *
 * `id` identifies the logical range while `[id, revision]` identifies the
 * exact image used by a session. Replacing an image creates a new revision;
 * it never overwrites the image referenced by historical sessions.
 */
export interface RangeMap extends ImageDimensions {
  id: string
  name: string
  imageBlob: Blob
  revision: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

/** Coordinates are normalized to the image (0–1). Radius uses its short edge. */
export interface Target {
  cx: number
  cy: number
  radius: number
}

/**
 * Landing coordinates are normalized to the image (0–1). `radius` is the ring
 * the shot was played against, in the same units as `Target.radius`. It equals
 * the session's target radius except in Shrink the Ring, where the ring shrinks.
 */
export interface Shot {
  id: string
  x: number
  y: number
  radius: number
  recordedAt: ISODateString
}

export type SessionStatus = 'draft' | 'completed'

export interface PracticeSession {
  id: string
  rangeId: string
  rangeRevision: number
  /** The game this session is played as. Sessions from before games are `bullseye`. */
  mode: GameMode
  club: string
  note: string
  /** The ring's centre, and its starting radius. */
  target: Target
  targetLocked: boolean
  shots: Shot[]
  status: SessionStatus
  createdAt: ISODateString
  updatedAt: ISODateString
  completedAt: ISODateString | null
}

/** The single preferences record stored for the browser profile. */
export interface Preferences {
  activeRangeId: string | null
  lastClub: string | null
  onboardingComplete: boolean
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  activeRangeId: null,
  lastClub: null,
  onboardingComplete: false,
})

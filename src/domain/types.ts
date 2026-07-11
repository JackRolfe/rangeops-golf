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

/** Landing coordinates are normalized to the image (0–1). */
export interface Shot {
  id: string
  x: number
  y: number
  recordedAt: ISODateString
}

export type SessionStatus = 'draft' | 'completed'

export interface PracticeSession {
  id: string
  rangeId: string
  rangeRevision: number
  club: string
  note: string
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

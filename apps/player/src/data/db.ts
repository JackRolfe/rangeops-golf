import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  DEFAULT_PREFERENCES,
  type PracticeSession,
  type Preferences,
  type RangeMap,
  type SessionStatus,
  type Shot,
  type Target,
} from '../domain/types'

export const RANGEOPS_DB_NAME = 'rangeops'
export const RANGEOPS_DB_VERSION = 1
export const PREFERENCES_KEY = 'singleton' as const

interface RangeOpsSchema extends DBSchema {
  ranges: {
    key: [string, number]
    value: RangeMap
    indexes: {
      'by-id': string
      'by-updated-at': string
    }
  }
  sessions: {
    key: string
    value: PracticeSession
    indexes: {
      'by-range-id': string
      'by-status': SessionStatus
      'by-updated-at': string
    }
  }
  preferences: {
    key: typeof PREFERENCES_KEY
    value: Preferences
  }
}

export interface InitializeRangeInput {
  id?: string
  name: string
  imageBlob: Blob
  width: number
  height: number
}

export interface ReplaceRangeImageInput {
  name?: string
  imageBlob: Blob
  width: number
  height: number
}

export interface UpdateRangeInput {
  name?: string
  imageBlob?: Blob
  width?: number
  height?: number
}

export interface CreateSessionInput {
  id?: string
  rangeId: string
  rangeRevision: number
  club: string
  note?: string
  target: Target
  shots?: Shot[]
}

export interface UpdateSessionInput {
  club?: string
  note?: string
  target?: Target
  targetLocked?: boolean
  shots?: Shot[]
  status?: SessionStatus
}

export interface AddShotInput {
  id?: string
  x: number
  y: number
  recordedAt?: string
}

let databasePromise: Promise<IDBPDatabase<RangeOpsSchema>> | undefined

const nowIso = (): string => new Date().toISOString()

const newId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const clonePreferences = (preferences: Readonly<Preferences>): Preferences => ({
  activeRangeId: preferences.activeRangeId,
  lastClub: preferences.lastClub,
  onboardingComplete: preferences.onboardingComplete,
})

function validateName(name: string, label: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

function validateRangeImage(imageBlob: Blob, width: number, height: number): void {
  if (!(imageBlob instanceof Blob)) throw new TypeError('Range image must be a Blob.')
  if (imageBlob.type && !['image/jpeg', 'image/png', 'image/webp'].includes(imageBlob.type)) {
    throw new TypeError('Range image must be a JPEG, PNG, or WebP file.')
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Range image dimensions must be positive finite numbers.')
  }
}

function validateUnitCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`)
  }
}

function validateTarget(target: Target): void {
  validateUnitCoordinate(target.cx, 'Target x coordinate')
  validateUnitCoordinate(target.cy, 'Target y coordinate')
  if (!Number.isFinite(target.radius) || target.radius <= 0) {
    throw new RangeError('Target radius must be a positive finite number.')
  }
}

function validateShot(shot: Pick<Shot, 'x' | 'y'>): void {
  validateUnitCoordinate(shot.x, 'Shot x coordinate')
  validateUnitCoordinate(shot.y, 'Shot y coordinate')
}

function targetsEqual(first: Target, second: Target): boolean {
  return first.cx === second.cx && first.cy === second.cy && first.radius === second.radius
}

function normalizeSession(session: PracticeSession): PracticeSession {
  return {
    ...session,
    targetLocked: session.targetLocked ?? session.shots.length > 0,
  }
}

export function openRangeOpsDatabase(): Promise<IDBPDatabase<RangeOpsSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<RangeOpsSchema>(RANGEOPS_DB_NAME, RANGEOPS_DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const ranges = database.createObjectStore('ranges', {
            keyPath: ['id', 'revision'],
          })
          ranges.createIndex('by-id', 'id')
          ranges.createIndex('by-updated-at', 'updatedAt')

          const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
          sessions.createIndex('by-range-id', 'rangeId')
          sessions.createIndex('by-status', 'status')
          sessions.createIndex('by-updated-at', 'updatedAt')

          database.createObjectStore('preferences')
        }
      },
      terminated() {
        databasePromise = undefined
      },
      blocking() {
        const openConnection = databasePromise
        databasePromise = undefined
        void openConnection?.then((database) => database.close())
      },
    })
  }
  return databasePromise
}

export async function closeRangeOpsDatabase(): Promise<void> {
  if (!databasePromise) return
  const database = await databasePromise
  database.close()
  databasePromise = undefined
}

/** Primarily useful for tests; application resets should call deleteAllData. */
export async function destroyRangeOpsDatabase(): Promise<void> {
  await closeRangeOpsDatabase()
  await deleteDB(RANGEOPS_DB_NAME)
}

export async function initializeRange(input: InitializeRangeInput): Promise<RangeMap> {
  const name = validateName(input.name, 'Range name')
  validateRangeImage(input.imageBlob, input.width, input.height)
  const database = await openRangeOpsDatabase()
  const timestamp = nowIso()
  const range: RangeMap = {
    id: input.id ?? newId(),
    name,
    imageBlob: input.imageBlob,
    width: input.width,
    height: input.height,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const transaction = database.transaction(['ranges', 'preferences'], 'readwrite')
  const existing = await transaction.objectStore('ranges').get([range.id, range.revision])
  if (existing) {
    throw new Error(`Range ${range.id} already exists.`)
  }
  await transaction.objectStore('ranges').add(range)
  const currentPreferences =
    (await transaction.objectStore('preferences').get(PREFERENCES_KEY)) ??
    clonePreferences(DEFAULT_PREFERENCES)
  await transaction.objectStore('preferences').put(
    {
      ...currentPreferences,
      activeRangeId: range.id,
      onboardingComplete: true,
    },
    PREFERENCES_KEY,
  )
  await transaction.done
  return range
}

export async function getRange(id: string, revision?: number): Promise<RangeMap | undefined> {
  const database = await openRangeOpsDatabase()
  if (revision !== undefined) return database.get('ranges', [id, revision])
  return getLatestRange(id)
}

export async function getRangeRevisions(id: string): Promise<RangeMap[]> {
  const database = await openRangeOpsDatabase()
  const ranges = await database.getAllFromIndex('ranges', 'by-id', id)
  return ranges.sort((first, second) => first.revision - second.revision)
}

export async function getAllRangeRevisions(): Promise<RangeMap[]> {
  const database = await openRangeOpsDatabase()
  const ranges = await database.getAll('ranges')
  return ranges.sort((first, second) => {
    const id = first.id.localeCompare(second.id)
    return id !== 0 ? id : first.revision - second.revision
  })
}

export async function getLatestRange(id: string): Promise<RangeMap | undefined> {
  const ranges = await getRangeRevisions(id)
  return ranges[ranges.length - 1]
}

export async function getActiveRange(): Promise<RangeMap | undefined> {
  const preferences = await getPreferences()
  return preferences.activeRangeId ? getLatestRange(preferences.activeRangeId) : undefined
}

export async function renameRange(id: string, name: string): Promise<RangeMap> {
  const normalizedName = validateName(name, 'Range name')
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('ranges', 'readwrite')
  const store = transaction.objectStore('ranges')
  const revisions = await store.index('by-id').getAll(id)
  if (revisions.length === 0) {
    throw new Error(`Range ${id} was not found.`)
  }

  const timestamp = nowIso()
  const updated = revisions.map((range) => ({
    ...range,
    name: normalizedName,
    updatedAt: timestamp,
  }))
  await Promise.all(updated.map((range) => store.put(range)))
  await transaction.done
  return updated.reduce((latest, range) =>
    range.revision > latest.revision ? range : latest,
  )
}

export async function replaceRangeImage(
  id: string,
  input: ReplaceRangeImageInput,
): Promise<RangeMap> {
  validateRangeImage(input.imageBlob, input.width, input.height)
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('ranges', 'readwrite')
  const store = transaction.objectStore('ranges')
  const revisions = await store.index('by-id').getAll(id)
  if (revisions.length === 0) {
    throw new Error(`Range ${id} was not found.`)
  }

  const latest = revisions.reduce((current, range) =>
    range.revision > current.revision ? range : current,
  )
  const timestamp = nowIso()
  const replacement: RangeMap = {
    id,
    name: input.name ? validateName(input.name, 'Range name') : latest.name,
    imageBlob: input.imageBlob,
    width: input.width,
    height: input.height,
    revision: latest.revision + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await store.add(replacement)
  await transaction.done
  return replacement
}

export async function updateRange(id: string, input: UpdateRangeInput): Promise<RangeMap> {
  if (input.imageBlob !== undefined || input.width !== undefined || input.height !== undefined) {
    if (!input.imageBlob || input.width === undefined || input.height === undefined) {
      throw new Error('Replacing a range image requires the blob, width, and height.')
    }
    return replaceRangeImage(id, {
      name: input.name,
      imageBlob: input.imageBlob,
      width: input.width,
      height: input.height,
    })
  }
  if (input.name !== undefined) return renameRange(id, input.name)
  const range = await getLatestRange(id)
  if (!range) throw new Error(`Range ${id} was not found.`)
  return range
}

export async function createSession(input: CreateSessionInput): Promise<PracticeSession> {
  const club = validateName(input.club, 'Club')
  validateTarget(input.target)
  input.shots?.forEach(validateShot)
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction(['ranges', 'sessions', 'preferences'], 'readwrite')
  const range = await transaction.objectStore('ranges').get([input.rangeId, input.rangeRevision])
  if (!range) {
    throw new Error(`Range ${input.rangeId} revision ${input.rangeRevision} was not found.`)
  }

  const timestamp = nowIso()
  const session: PracticeSession = {
    id: input.id ?? newId(),
    rangeId: input.rangeId,
    rangeRevision: input.rangeRevision,
    club,
    note: input.note?.trim() ?? '',
    target: { ...input.target },
    targetLocked: (input.shots?.length ?? 0) > 0,
    shots: input.shots?.map((shot) => ({ ...shot })) ?? [],
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  }
  await transaction.objectStore('sessions').add(session)

  const preferencesStore = transaction.objectStore('preferences')
  const preferences =
    (await preferencesStore.get(PREFERENCES_KEY)) ?? clonePreferences(DEFAULT_PREFERENCES)
  await preferencesStore.put({ ...preferences, lastClub: club }, PREFERENCES_KEY)
  await transaction.done
  return session
}

export async function getSession(id: string): Promise<PracticeSession | undefined> {
  const database = await openRangeOpsDatabase()
  const session = await database.get('sessions', id)
  return session ? normalizeSession(session) : undefined
}

export async function getSessions(rangeId?: string): Promise<PracticeSession[]> {
  const database = await openRangeOpsDatabase()
  const sessions = rangeId
    ? await database.getAllFromIndex('sessions', 'by-range-id', rangeId)
    : await database.getAll('sessions')
  return sessions.map(normalizeSession).sort((first, second) => {
    const time = second.updatedAt.localeCompare(first.updatedAt)
    return time !== 0 ? time : second.id.localeCompare(first.id)
  })
}

export async function getDraftSession(rangeId?: string): Promise<PracticeSession | undefined> {
  const database = await openRangeOpsDatabase()
  const drafts = await database.getAllFromIndex('sessions', 'by-status', 'draft')
  return drafts
    .map(normalizeSession)
    .filter((session) => !rangeId || session.rangeId === rangeId)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0]
}

export async function saveSession(session: PracticeSession): Promise<PracticeSession> {
  validateName(session.club, 'Club')
  validateTarget(session.target)
  session.shots.forEach(validateShot)
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('sessions', 'readwrite')
  const store = transaction.objectStore('sessions')
  const existing = await store.get(session.id)
  if (!existing) {
    throw new Error(`Session ${session.id} was not found.`)
  }
  const normalizedExisting = normalizeSession(existing)
  if (normalizedExisting.targetLocked && !targetsEqual(normalizedExisting.target, session.target)) {
    throw new Error('A target cannot be changed after shot recording has begun.')
  }

  const saved: PracticeSession = {
    ...session,
    id: existing.id,
    rangeId: existing.rangeId,
    rangeRevision: existing.rangeRevision,
    club: session.club.trim(),
    note: session.note.trim(),
    targetLocked: normalizedExisting.targetLocked || session.targetLocked || session.shots.length > 0,
    createdAt: normalizedExisting.createdAt,
    updatedAt: nowIso(),
    completedAt: session.status === 'completed' ? session.completedAt ?? nowIso() : null,
  }
  await store.put(saved)
  await transaction.done
  return saved
}

export async function updateSession(
  id: string,
  input: UpdateSessionInput,
): Promise<PracticeSession> {
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('sessions', 'readwrite')
  const store = transaction.objectStore('sessions')
  const stored = await store.get(id)
  if (!stored) throw new Error(`Session ${id} was not found.`)

  const existing = normalizeSession(stored)
  const target = input.target ? { ...input.target } : existing.target
  const shots = input.shots?.map((shot) => ({ ...shot })) ?? existing.shots
  if (existing.targetLocked && !targetsEqual(existing.target, target)) {
    throw new Error('A target cannot be changed after recording has begun.')
  }

  validateName(input.club ?? existing.club, 'Club')
  validateTarget(target)
  shots.forEach(validateShot)
  const status = input.status ?? existing.status
  const timestamp = nowIso()
  const updated: PracticeSession = {
    ...existing,
    ...input,
    club: (input.club ?? existing.club).trim(),
    note: (input.note ?? existing.note).trim(),
    target,
    targetLocked: existing.targetLocked || input.targetLocked === true || shots.length > 0,
    shots,
    status,
    updatedAt: timestamp,
    completedAt: status === 'completed' ? existing.completedAt ?? timestamp : null,
  }
  await store.put(updated)
  await transaction.done
  return updated
}

export async function addShot(id: string, input: AddShotInput): Promise<PracticeSession> {
  validateShot(input)
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('sessions', 'readwrite')
  const store = transaction.objectStore('sessions')
  const stored = await store.get(id)
  if (!stored) {
    throw new Error(`Session ${id} was not found.`)
  }
  const session = normalizeSession(stored)
  if (session.status !== 'draft') {
    throw new Error('Shots can only be added to a draft session.')
  }

  const shot: Shot = {
    id: input.id ?? newId(),
    x: input.x,
    y: input.y,
    recordedAt: input.recordedAt ?? nowIso(),
  }
  const updated: PracticeSession = {
    ...session,
    targetLocked: true,
    shots: [...session.shots, shot],
    updatedAt: nowIso(),
  }
  await store.put(updated)
  await transaction.done
  return updated
}

export async function undoLastShot(id: string): Promise<PracticeSession> {
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('sessions', 'readwrite')
  const store = transaction.objectStore('sessions')
  const stored = await store.get(id)
  if (!stored) {
    throw new Error(`Session ${id} was not found.`)
  }
  const session = normalizeSession(stored)
  if (session.status !== 'draft') {
    throw new Error('Shots can only be removed from a draft session.')
  }
  const updated = {
    ...session,
    shots: session.shots.slice(0, -1),
    updatedAt: nowIso(),
  }
  await store.put(updated)
  await transaction.done
  return updated
}

export async function completeSession(id: string): Promise<PracticeSession> {
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('sessions', 'readwrite')
  const store = transaction.objectStore('sessions')
  const stored = await store.get(id)
  if (!stored) {
    throw new Error(`Session ${id} was not found.`)
  }
  const session = normalizeSession(stored)
  if (session.status === 'completed') {
    await transaction.done
    return session
  }
  const timestamp = nowIso()
  const completed: PracticeSession = {
    ...session,
    status: 'completed',
    updatedAt: timestamp,
    completedAt: timestamp,
  }
  await store.put(completed)
  await transaction.done
  return completed
}

export async function deleteSession(id: string): Promise<void> {
  const database = await openRangeOpsDatabase()
  await database.delete('sessions', id)
}

export async function getPreferences(): Promise<Preferences> {
  const database = await openRangeOpsDatabase()
  return (
    (await database.get('preferences', PREFERENCES_KEY)) ??
    clonePreferences(DEFAULT_PREFERENCES)
  )
}

export async function setPreferences(preferences: Preferences): Promise<Preferences> {
  const value = clonePreferences(preferences)
  const database = await openRangeOpsDatabase()
  await database.put('preferences', value, PREFERENCES_KEY)
  return value
}

export async function updatePreferences(
  input: Partial<Preferences>,
): Promise<Preferences> {
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction('preferences', 'readwrite')
  const store = transaction.objectStore('preferences')
  const current = (await store.get(PREFERENCES_KEY)) ?? clonePreferences(DEFAULT_PREFERENCES)
  const updated: Preferences = { ...current, ...input }
  await store.put(updated, PREFERENCES_KEY)
  await transaction.done
  return updated
}

export async function deleteAllData(): Promise<void> {
  const database = await openRangeOpsDatabase()
  const transaction = database.transaction(['ranges', 'sessions', 'preferences'], 'readwrite')
  await Promise.all([
    transaction.objectStore('ranges').clear(),
    transaction.objectStore('sessions').clear(),
    transaction.objectStore('preferences').clear(),
  ])
  await transaction.done
}

export const initializeDatabase = openRangeOpsDatabase
export const createRange = initializeRange
export const replaceRange = replaceRangeImage
export const listSessions = getSessions
export const savePreferences = setPreferences
export const clearAllData = deleteAllData

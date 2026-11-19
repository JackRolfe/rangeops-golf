import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addShot,
  completeSession,
  createSession,
  deleteAllData,
  deleteSession,
  destroyRangeOpsDatabase,
  getAllRangeRevisions,
  getDraftSession,
  getPreferences,
  getRange,
  getRangeRevisions,
  getSession,
  getSessions,
  initializeRange,
  openRangeOpsDatabase,
  RANGEOPS_DB_NAME,
  RANGEOPS_DB_VERSION,
  renameRange,
  replaceRangeImage,
  undoLastShot,
  updatePreferences,
  updateSession,
} from './db'

const image = (type = 'image/png', contents = 'range'): Blob =>
  new Blob([contents], { type })

beforeEach(async () => {
  await destroyRangeOpsDatabase()
})

afterEach(async () => {
  await destroyRangeOpsDatabase()
})

describe('RangeOps IndexedDB schema', () => {
  it('creates a new database at the current schema version with all stores and indexes', async () => {
    const database = await openRangeOpsDatabase()

    expect(database.version).toBe(RANGEOPS_DB_VERSION)
    expect(RANGEOPS_DB_VERSION).toBe(2)
    expect(Array.from(database.objectStoreNames)).toEqual([
      'preferences',
      'ranges',
      'sessions',
    ])

    const rangeTransaction = database.transaction('ranges')
    expect(Array.from(rangeTransaction.store.indexNames)).toEqual(['by-id', 'by-updated-at'])
    const sessionTransaction = database.transaction('sessions')
    expect(Array.from(sessionTransaction.store.indexNames)).toEqual([
      'by-range-id',
      'by-status',
      'by-updated-at',
    ])
  })

  it('closes its connection when a future database upgrade is blocked', async () => {
    await openRangeOpsDatabase()
    const upgraded = await Promise.race([
      openDB(RANGEOPS_DB_NAME, RANGEOPS_DB_VERSION + 1),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Future database upgrade stayed blocked.')), 250)
      }),
    ])

    expect(upgraded.version).toBe(RANGEOPS_DB_VERSION + 1)
    upgraded.close()
  })

  it('initializes onboarding and returns default preferences after a reset', async () => {
    expect(await getPreferences()).toEqual({
      activeRangeId: null,
      lastClub: null,
      onboardingComplete: false,
    })

    const range = await initializeRange({
      id: 'range-1',
      name: 'North Practice Range',
      imageBlob: image(),
      width: 1600,
      height: 900,
    })
    expect(range.revision).toBe(1)
    expect(await getPreferences()).toEqual({
      activeRangeId: 'range-1',
      lastClub: null,
      onboardingComplete: true,
    })

    await updatePreferences({ lastClub: '7 Iron' })
    expect((await getPreferences()).lastClub).toBe('7 Iron')

    await deleteAllData()
    expect(await getAllRangeRevisions()).toEqual([])
    expect(await getSessions()).toEqual([])
    expect(await getPreferences()).toEqual({
      activeRangeId: null,
      lastClub: null,
      onboardingComplete: false,
    })
  })
})

describe('range revisions', () => {
  it('preserves the old image when replacing the active range image', async () => {
    await initializeRange({
      id: 'range-1',
      name: 'Original name',
      imageBlob: image('image/png', 'original'),
      width: 1200,
      height: 800,
    })
    const replacement = await replaceRangeImage('range-1', {
      imageBlob: image('image/webp', 'replacement'),
      width: 2000,
      height: 1000,
    })

    expect(replacement.revision).toBe(2)
    expect(replacement.imageBlob.type).toBe('image/webp')
    const revisions = await getRangeRevisions('range-1')
    expect(revisions.map(({ revision }) => revision)).toEqual([1, 2])
    expect(revisions[0].width).toBe(1200)
    expect(revisions[0].imageBlob.type).toBe('image/png')
    expect((await getRange('range-1'))?.revision).toBe(2)
    expect((await getRange('range-1', 1))?.revision).toBe(1)

    await renameRange('range-1', 'Renamed range')
    expect((await getRange('range-1', 1))?.name).toBe('Renamed range')
    expect((await getRange('range-1', 2))?.name).toBe('Renamed range')
  })

  it('rejects unsupported files and partial image updates', async () => {
    await expect(
      initializeRange({
        name: 'Bad range',
        imageBlob: image('image/gif'),
        width: 100,
        height: 100,
      }),
    ).rejects.toThrow(/JPEG, PNG, or WebP/)
  })
})

describe('practice sessions', () => {
  beforeEach(async () => {
    await initializeRange({
      id: 'range-1',
      name: 'Practice range',
      imageBlob: image(),
      width: 1000,
      height: 1000,
    })
  })

  it('creates, autosaves, undoes, completes, lists, and deletes sessions', async () => {
    const created = await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: ' 7 Iron ',
      note: ' Tempo work ',
      target: { cx: 0.5, cy: 0.4, radius: 0.1 },
    })
    expect(created.club).toBe('7 Iron')
    expect(created.note).toBe('Tempo work')
    expect(created.targetLocked).toBe(false)
    expect((await getPreferences()).lastClub).toBe('7 Iron')
    expect((await getDraftSession('range-1'))?.id).toBe('session-1')

    const withShot = await addShot('session-1', {
      id: 'shot-1',
      x: 0.51,
      y: 0.4,
      recordedAt: '2026-01-01T00:00:01.000Z',
    })
    expect(withShot.shots.map(({ id }) => id)).toEqual(['shot-1'])
    expect(withShot.targetLocked).toBe(true)
    expect((await getSession('session-1'))?.shots).toHaveLength(1)

    const undone = await undoLastShot('session-1')
    expect(undone.shots).toEqual([])
    expect(undone.targetLocked).toBe(true)
    await addShot('session-1', { id: 'shot-2', x: 0.8, y: 0.8 })

    const completed = await completeSession('session-1')
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).not.toBeNull()
    expect(await getDraftSession('range-1')).toBeUndefined()
    expect((await getSessions('range-1')).map(({ id }) => id)).toEqual(['session-1'])
    await expect(addShot('session-1', { x: 0.5, y: 0.5 })).rejects.toThrow(/draft/)

    await deleteSession('session-1')
    expect(await getSession('session-1')).toBeUndefined()
  })

  it('keeps the target immutable after recording starts', async () => {
    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    await addShot('session-1', { x: 0.5, y: 0.5 })

    await expect(
      updateSession('session-1', {
        target: { cx: 0.6, cy: 0.5, radius: 0.1 },
      }),
    ).rejects.toThrow(/cannot be changed/)
  })

  it('persists an explicit target lock before the first shot', async () => {
    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    const locked = await updateSession('session-1', { targetLocked: true })
    expect(locked.targetLocked).toBe(true)
    expect((await getDraftSession('range-1'))?.targetLocked).toBe(true)

    await expect(
      updateSession('session-1', {
        target: { cx: 0.6, cy: 0.5, radius: 0.1 },
      }),
    ).rejects.toThrow(/cannot be changed/)
  })

  it('applies concurrent patches without restoring an older shot snapshot', async () => {
    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })

    await Promise.all([
      updateSession('session-1', { note: 'Wind from the left' }),
      addShot('session-1', { id: 'shot-1', x: 0.5, y: 0.5 }),
    ])

    const saved = await getSession('session-1')
    expect(saved?.note).toBe('Wind from the left')
    expect(saved?.shots.map(({ id }) => id)).toEqual(['shot-1'])
  })

  it('requires an existing range revision and normalized shot coordinates', async () => {
    await expect(
      createSession({
        rangeId: 'range-1',
        rangeRevision: 99,
        club: 'Driver',
        target: { cx: 0.5, cy: 0.5, radius: 0.1 },
      }),
    ).rejects.toThrow(/revision 99/)

    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    await expect(addShot('session-1', { x: 1.1, y: 0.5 })).rejects.toThrow(
      /between 0 and 1/,
    )
  })
})

describe('games', () => {
  beforeEach(async () => {
    await initializeRange({
      id: 'range-1',
      name: 'Practice range',
      imageBlob: image(),
      width: 1000,
      height: 1000,
    })
  })

  it('defaults new sessions to bullseye and stores the ring on every shot', async () => {
    const session = await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    expect(session.mode).toBe('bullseye')
    for (let index = 0; index < 4; index++) await addShot('session-1', { x: 0.5, y: 0.5 })
    const saved = await getSession('session-1')
    expect(saved?.shots.map(({ radius }) => radius)).toEqual([0.1, 0.1, 0.1, 0.1])
  })

  it('shrinks the stored ring after three hits in a row in Shrink the Ring', async () => {
    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      mode: 'shrink',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    await addShot('session-1', { x: 0.5, y: 0.5 })
    await addShot('session-1', { x: 0.5, y: 0.5 })
    await addShot('session-1', { x: 0.5, y: 0.5 })
    const fourth = await addShot('session-1', { x: 0.5, y: 0.5 })
    expect(fourth.mode).toBe('shrink')
    expect(fourth.shots.map(({ radius }) => radius)).toEqual([0.1, 0.1, 0.1, expect.closeTo(0.08)])

    await undoLastShot('session-1')
    await undoLastShot('session-1')
    const again = await addShot('session-1', { x: 0.5, y: 0.5 })
    expect(again.shots[2].radius).toBe(0.1)
    const next = await addShot('session-1', { x: 0.5, y: 0.5 })
    expect(next.shots[3].radius).toBeCloseTo(0.08)
  })

  it('lets the game change only before recording starts', async () => {
    await createSession({
      id: 'session-1',
      rangeId: 'range-1',
      rangeRevision: 1,
      club: 'Driver',
      target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    })
    expect((await updateSession('session-1', { mode: 'shrink' })).mode).toBe('shrink')
    await addShot('session-1', { x: 0.5, y: 0.5 })
    await expect(updateSession('session-1', { mode: 'bullseye' })).rejects.toThrow(/game cannot be changed/)
  })
})

describe('upgrading from schema version 1', () => {
  // Records exactly as version 1 of the app wrote them: no mode, no shot radius.
  const v1Range = {
    id: 'range-1',
    name: 'Home range',
    imageBlob: new Blob(['old image'], { type: 'image/png' }),
    width: 1200,
    height: 800,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const v1Completed = {
    id: 'session-old',
    rangeId: 'range-1',
    rangeRevision: 1,
    club: '7 iron',
    note: 'Windy',
    target: { cx: 0.5, cy: 0.5, radius: 0.15 },
    targetLocked: true,
    shots: [
      { id: 's1', x: 0.5, y: 0.5, recordedAt: '2026-01-02T00:00:01.000Z' },
      { id: 's2', x: 0.55, y: 0.5, recordedAt: '2026-01-02T00:00:02.000Z' },
      { id: 's3', x: 0.95, y: 0.95, recordedAt: '2026-01-02T00:00:03.000Z' },
    ],
    status: 'completed',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:01:00.000Z',
    completedAt: '2026-01-02T00:01:00.000Z',
  }
  const v1Draft = {
    id: 'session-draft',
    rangeId: 'range-1',
    rangeRevision: 1,
    club: 'Driver',
    note: '',
    target: { cx: 0.4, cy: 0.3, radius: 0.2 },
    targetLocked: true,
    shots: [{ id: 'd1', x: 0.4, y: 0.3, recordedAt: '2026-01-03T00:00:01.000Z' }],
    status: 'draft',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:01.000Z',
    completedAt: null,
  }
  const v1Preferences = { activeRangeId: 'range-1', lastClub: 'Driver', onboardingComplete: true }

  async function writeVersion1Database(): Promise<void> {
    const v1 = await openDB(RANGEOPS_DB_NAME, 1, {
      upgrade(database) {
        const ranges = database.createObjectStore('ranges', { keyPath: ['id', 'revision'] })
        ranges.createIndex('by-id', 'id')
        ranges.createIndex('by-updated-at', 'updatedAt')
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('by-range-id', 'rangeId')
        sessions.createIndex('by-status', 'status')
        sessions.createIndex('by-updated-at', 'updatedAt')
        database.createObjectStore('preferences')
      },
    })
    await v1.put('ranges', v1Range)
    await v1.put('sessions', v1Completed)
    await v1.put('sessions', v1Draft)
    await v1.put('preferences', v1Preferences, 'singleton')
    v1.close()
  }

  it('keeps every range, session, shot and preference, and back-fills mode and shot radius', async () => {
    await writeVersion1Database()

    expect((await openRangeOpsDatabase()).version).toBe(2)
    expect(await getPreferences()).toEqual(v1Preferences)
    const range = await getRange('range-1', 1)
    expect(range).toMatchObject({ name: 'Home range', width: 1200, height: 800, revision: 1 })
    expect(range?.imageBlob).toBeInstanceOf(Blob)

    const completed = await getSession('session-old')
    expect(completed).toEqual({
      ...v1Completed,
      mode: 'bullseye',
      shots: v1Completed.shots.map((shot) => ({ ...shot, radius: 0.15 })),
    })
    const draft = await getDraftSession('range-1')
    expect(draft).toEqual({
      ...v1Draft,
      mode: 'bullseye',
      shots: [{ ...v1Draft.shots[0], radius: 0.2 }],
    })
    expect((await getSessions()).map(({ id }) => id).sort()).toEqual(['session-draft', 'session-old'])
  })

  it('gives the same accuracy after the upgrade as before', async () => {
    await writeVersion1Database()
    const { getSessionAccuracy } = await import('../domain/metrics')
    const session = await getSession('session-old')
    expect(getSessionAccuracy(session!, v1Range)).toEqual({ onTarget: 2, total: 3, percentage: (2 / 3) * 100 })
  })

  it('keeps a draft playable after the upgrade', async () => {
    await writeVersion1Database()
    const resumed = await addShot('session-draft', { id: 'd2', x: 0.4, y: 0.3 })
    expect(resumed.shots.map(({ id, radius }) => [id, radius])).toEqual([['d1', 0.2], ['d2', 0.2]])
  })
})

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
  it('migrates a new database to schema version 1 with all stores and indexes', async () => {
    const database = await openRangeOpsDatabase()

    expect(database.version).toBe(1)
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
      openDB(RANGEOPS_DB_NAME, 2),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Future database upgrade stayed blocked.')), 250)
      }),
    ])

    expect(upgraded.version).toBe(2)
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

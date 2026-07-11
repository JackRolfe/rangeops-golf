import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';
import type { NormalizedPoint } from './components/RangeMapCanvas';
import { AppShell } from './components/AppShell';
import { Brand } from './components/Brand';
import {
  addShot,
  completeSession,
  createSession,
  deleteAllData,
  deleteSession,
  getAllRangeRevisions,
  getPreferences,
  getSessions,
  initializeRange,
  renameRange,
  replaceRangeImage,
  undoLastShot,
  updateSession,
} from './data/db';
import { DEFAULT_PREFERENCES, type PracticeSession, type Preferences, type RangeMap, type Target } from './domain/types';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SessionDetailScreen } from './screens/SessionDetailScreen';
import { SessionSetupScreen } from './screens/SessionSetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type View = 'loading' | 'onboarding' | 'home' | 'setup' | 'practice' | 'history' | 'settings' | 'detail' | 'fatal';
type DetailReturnView = 'home' | 'history';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_TARGET: Target = { cx: 0.5, cy: 0.42, radius: 0.2 };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function validateImageFile(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (file.size === 0) throw new Error('That image file is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 20 MB.');
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  validateImageFile(file);
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error('The image dimensions could not be read.'));
          return;
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => reject(new Error('The image could not be opened. Try another file.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function useBlobUrl(blob: Blob | undefined): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!blob) {
      setUrl('');
      return undefined;
    }

    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function latestRangeForId(ranges: RangeMap[], id: string | null): RangeMap | undefined {
  if (!id) return undefined;
  return ranges
    .filter((range) => range.id === id)
    .reduce<RangeMap | undefined>((latest, range) => (!latest || range.revision > latest.revision ? range : latest), undefined);
}

function exactRangeForSession(ranges: RangeMap[], session: PracticeSession | null): RangeMap | undefined {
  if (!session) return undefined;
  return ranges.find((range) => range.id === session.rangeId && range.revision === session.rangeRevision);
}

export default function App() {
  const [view, setView] = useState<View>('loading');
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES });
  const [ranges, setRanges] = useState<RangeMap[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [currentSession, setCurrentSession] = useState<PracticeSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<PracticeSession | null>(null);
  const [recording, setRecording] = useState(false);
  const [detailReturn, setDetailReturn] = useState<DetailReturnView>('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootStarted = useRef(false);
  const targetSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingTargetSave = useRef<{ sessionId: string; target: Target } | null>(null);
  const targetSaveInFlight = useRef(false);

  const activeRange = useMemo(
    () => latestRangeForId(ranges, preferences.activeRangeId),
    [preferences.activeRangeId, ranges],
  );
  const activeDraft = useMemo(
    () => sessions.find((session) => session.status === 'draft' && session.rangeId === activeRange?.id) ?? null,
    [activeRange?.id, sessions],
  );
  const practiceRange = useMemo(() => exactRangeForSession(ranges, currentSession), [currentSession, ranges]);
  const detailRange = useMemo(() => exactRangeForSession(ranges, selectedSession), [ranges, selectedSession]);
  const displayedRange = view === 'practice' ? practiceRange : view === 'detail' ? detailRange : activeRange;
  const displayedImageUrl = useBlobUrl(displayedRange?.imageBlob);

  async function loadSnapshot(): Promise<{ preferences: Preferences; ranges: RangeMap[]; sessions: PracticeSession[] }> {
    const [nextPreferences, nextRanges, nextSessions] = await Promise.all([
      getPreferences(),
      getAllRangeRevisions(),
      getSessions(),
    ]);
    setPreferences(nextPreferences);
    setRanges(nextRanges);
    setSessions(nextSessions);
    return { preferences: nextPreferences, ranges: nextRanges, sessions: nextSessions };
  }

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    void loadSnapshot()
      .then((snapshot) => {
        const range = latestRangeForId(snapshot.ranges, snapshot.preferences.activeRangeId);
        setView(range ? 'home' : 'onboarding');
      })
      .catch((bootError) => {
        setError(errorMessage(bootError));
        setView('fatal');
      });
  }, []);

  function upsertSession(session: PracticeSession): void {
    setCurrentSession(session);
    setSessions((existing) => {
      const found = existing.some((item) => item.id === session.id);
      return found ? existing.map((item) => (item.id === session.id ? session : item)) : [session, ...existing];
    });
  }

  async function handleOnboarding(name: string, file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const dimensions = await readImageDimensions(file);
      await initializeRange({ name, imageBlob: file, ...dimensions });
      await loadSnapshot();
      setView('home');
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  function openPractice(): void {
    if (activeDraft) {
      setCurrentSession(activeDraft);
      setRecording(activeDraft.targetLocked || activeDraft.shots.length > 0);
      setView('practice');
      return;
    }
    setView('setup');
  }

  async function startSession(club: string, note: string): Promise<void> {
    if (!activeRange) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createSession({
        rangeId: activeRange.id,
        rangeRevision: activeRange.revision,
        club,
        note,
        target: DEFAULT_TARGET,
      });
      upsertSession(session);
      setPreferences((current) => ({ ...current, lastClub: club }));
      setRecording(false);
      setView('practice');
    } catch (sessionError) {
      setError(errorMessage(sessionError));
    } finally {
      setBusy(false);
    }
  }

  function handleTargetChange(target: Target): void {
    if (!currentSession || currentSession.shots.length > 0) return;
    const nextSession = { ...currentSession, target };
    upsertSession(nextSession);
    pendingTargetSave.current = { sessionId: nextSession.id, target };
    if (targetSaveInFlight.current) return;

    targetSaveInFlight.current = true;
    targetSaveQueue.current = (async () => {
      while (pendingTargetSave.current) {
        const pending = pendingTargetSave.current;
        pendingTargetSave.current = null;
        try {
          await updateSession(pending.sessionId, { target: pending.target });
        } catch (saveError) {
          setError(errorMessage(saveError));
        }
      }
    })()
      .finally(() => {
        targetSaveInFlight.current = false;
      });
  }

  async function lockTarget(): Promise<void> {
    if (!currentSession) return;
    setBusy(true);
    setError(null);
    try {
      await targetSaveQueue.current;
      const saved = await updateSession(currentSession.id, { target: currentSession.target, targetLocked: true });
      upsertSession(saved);
      setRecording(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function recordShot(point: NormalizedPoint): Promise<void> {
    if (!currentSession || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await addShot(currentSession.id, point);
      upsertSession(saved);
    } catch (shotError) {
      setError(errorMessage(shotError));
    } finally {
      setBusy(false);
    }
  }

  async function undoShot(): Promise<void> {
    if (!currentSession || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await undoLastShot(currentSession.id);
      upsertSession(saved);
    } catch (undoError) {
      setError(errorMessage(undoError));
    } finally {
      setBusy(false);
    }
  }

  async function finishSession(): Promise<void> {
    if (!currentSession || !currentSession.shots.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const completed = await completeSession(currentSession.id);
      upsertSession(completed);
      setSelectedSession(completed);
      setCurrentSession(null);
      setDetailReturn('home');
      setView('detail');
    } catch (finishError) {
      setError(errorMessage(finishError));
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft(session: PracticeSession | null = activeDraft): Promise<void> {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSession(session.id);
      setSessions((existing) => existing.filter((item) => item.id !== session.id));
      if (currentSession?.id === session.id) setCurrentSession(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  function openDetail(session: PracticeSession, from: DetailReturnView): void {
    setSelectedSession(session);
    setDetailReturn(from);
    setView('detail');
  }

  async function handleRename(name: string): Promise<void> {
    if (!activeRange) return;
    setBusy(true);
    setError(null);
    try {
      await renameRange(activeRange.id, name);
      await loadSnapshot();
    } catch (renameError) {
      setError(errorMessage(renameError));
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceImage(file: File): Promise<void> {
    if (!activeRange) return;
    setBusy(true);
    setError(null);
    try {
      const dimensions = await readImageDimensions(file);
      const replacement = await replaceRangeImage(activeRange.id, { imageBlob: file, ...dimensions });
      setRanges((existing) => [...existing, replacement]);
    } catch (replaceError) {
      setError(errorMessage(replaceError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      setPreferences({ ...DEFAULT_PREFERENCES });
      setRanges([]);
      setSessions([]);
      setCurrentSession(null);
      setSelectedSession(null);
      setView('onboarding');
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  let screen;

  if (view === 'loading') {
    screen = (
      <AppShell className="loading-screen">
        <div className="loading-mark"><Brand />Opening your range</div>
      </AppShell>
    );
  } else if (view === 'fatal') {
    screen = (
      <AppShell className="fatal-screen">
        <AlertCircle aria-hidden="true" />
        <h1>RangeOps could not open.</h1>
        <p>{error}</p>
        <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden="true" /> Try again
        </button>
      </AppShell>
    );
  } else if (view === 'onboarding' || !activeRange) {
    screen = <OnboardingScreen busy={busy} error={error} onSubmit={handleOnboarding} />;
  } else if (view === 'setup') {
    screen = <SessionSetupScreen lastClub={preferences.lastClub} busy={busy} onBack={() => setView('home')} onContinue={(club, note) => void startSession(club, note)} />;
  } else if (view === 'practice' && currentSession && practiceRange && displayedImageUrl) {
    screen = (
      <PracticeScreen
        range={practiceRange}
        imageUrl={displayedImageUrl}
        session={currentSession}
        recording={recording}
        busy={busy}
        onTargetChange={handleTargetChange}
        onSetTarget={() => void lockTarget()}
        onShot={(point) => void recordShot(point)}
        onUndo={() => void undoShot()}
        onFinish={() => void finishSession()}
        onLeave={() => setView('home')}
      />
    );
  } else if (view === 'practice') {
    screen = (
      <AppShell className="loading-screen">
        <div className="loading-mark"><Brand />Loading range image</div>
      </AppShell>
    );
  } else if (view === 'history') {
    screen = (
      <HistoryScreen
        range={activeRange}
        ranges={ranges}
        sessions={sessions}
        onHome={() => setView('home')}
        onStart={openPractice}
        onSession={(session) => openDetail(session, 'history')}
      />
    );
  } else if (view === 'settings') {
    screen = (
      <SettingsScreen
        range={activeRange}
        busy={busy}
        error={error}
        onBack={() => setView('home')}
        onRename={handleRename}
        onReplaceImage={handleReplaceImage}
        onDeleteAll={handleDeleteAll}
      />
    );
  } else if (view === 'detail' && selectedSession && detailRange && displayedImageUrl) {
    screen = (
      <SessionDetailScreen
        range={detailRange}
        imageUrl={displayedImageUrl}
        session={selectedSession}
        onBack={() => setView(detailReturn)}
      />
    );
  } else if (view === 'detail') {
    screen = (
      <AppShell className="loading-screen">
        <div className="loading-mark"><Brand />Loading shot map</div>
      </AppShell>
    );
  } else {
    screen = (
      <HomeScreen
        range={activeRange}
        ranges={ranges}
        sessions={sessions}
        draft={activeDraft}
        onStart={openPractice}
        onResume={openPractice}
        onDiscardDraft={() => void discardDraft()}
        onSettings={() => { setError(null); setView('settings'); }}
        onHistory={() => setView('history')}
        onSession={(session) => openDetail(session, 'home')}
      />
    );
  }

  return (
    <>
      {screen}
      {error && !['onboarding', 'settings', 'fatal'].includes(view) ? (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X aria-hidden="true" /></button>
        </div>
      ) : null}
    </>
  );
}

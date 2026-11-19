import { useState } from 'react';
import { ChevronDown, Hand, Move, Trophy, Undo2 } from 'lucide-react';
import type { PracticeSession, RangeMap, Target } from '../domain/types';
import type { NormalizedPoint } from '../components/RangeMapCanvas';
import { GAME_NAMES, SHRINK_FLOOR_RATIO, SHRINK_STREAK, ringForNextShot } from '../domain/games';
import { getSessionAccuracy, type BestSession } from '../domain/metrics';
import { formatPercent } from '../domain/format';
import { AppShell } from '../components/AppShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RangeMapCanvas } from '../components/RangeMapCanvas';

interface PracticeScreenProps {
  range: RangeMap;
  imageUrl: string;
  session: PracticeSession;
  recording: boolean;
  busy: boolean;
  /** The best earlier session with this club and game: the score to beat. */
  best: BestSession | null;
  onTargetChange: (target: Target) => void;
  onSetTarget: () => void;
  onShot: (point: NormalizedPoint) => void;
  onUndo: () => void;
  onFinish: () => void;
  onLeave: () => void;
}

/** What to tell the player about the ring in Shrink the Ring. */
function shrinkMessage(session: PracticeSession, range: RangeMap): string {
  const ring = ringForNextShot(session, range);
  const before = ringForNextShot({ ...session, shots: session.shots.slice(0, -1) }, range);
  const percent = formatPercent((ring.radius / session.target.radius) * 100);
  if (ring.shrinks > before.shrinks) return `The ring shrank to ${percent}%.`;
  if (ring.radius <= session.target.radius * SHRINK_FLOOR_RATIO + 1e-9) return 'The ring is as small as it gets.';
  const toGo = SHRINK_STREAK - (ring.streak % SHRINK_STREAK);
  return `${toGo} more in a row to shrink the ring.`;
}

export function PracticeScreen({
  range,
  imageUrl,
  session,
  recording,
  busy,
  best,
  onTargetChange,
  onSetTarget,
  onShot,
  onUndo,
  onFinish,
  onLeave,
}: PracticeScreenProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const summary = getSessionAccuracy(session, range);
  const ring = ringForNextShot(session, range);
  const shrink = session.mode === 'shrink';
  // While setting up, the ring is the starting ring the player is sizing.
  // Once playing, draw the ring the next shot will be judged against.
  const shownTarget = recording ? { ...session.target, radius: ring.radius } : session.target;

  return (
    <AppShell fullBleed className="practice-screen">
      <header className="practice-header">
        <button className="practice-header__club" type="button" onClick={() => setConfirmLeave(true)}>
          {session.club} <ChevronDown aria-hidden="true" />
        </button>
        <strong>{session.shots.length} {session.shots.length === 1 ? 'shot' : 'shots'}</strong>
        <button className="text-button" type="button" disabled={!recording || session.shots.length === 0 || busy} onClick={onFinish}>
          Finish
        </button>
      </header>

      <div className="practice-instruction" aria-live="polite">
        {recording ? <Hand aria-hidden="true" /> : <Move aria-hidden="true" />}
        <span className="practice-instruction__text">
          <small>{GAME_NAMES[session.mode]}</small>
          <strong>{recording ? 'Tap where the ball landed' : 'Move and resize the target'}</strong>
          {recording && shrink ? <small>{shrinkMessage(session, range)}</small> : null}
        </span>
      </div>

      <div className="practice-map-wrap">
        <RangeMapCanvas
          className="practice-map"
          imageUrl={imageUrl}
          imageWidth={range.width}
          imageHeight={range.height}
          target={shownTarget}
          shots={session.shots}
          mode={recording ? 'record' : 'setup'}
          disabled={busy}
          onTargetChange={onTargetChange}
          onShot={onShot}
        />
      </div>

      {recording ? (
        <footer className="practice-footer practice-footer--recording">
          <div className="practice-stat">
            <strong>{summary.onTarget}<span> of {summary.total}</span></strong>
            <small>on target</small>
          </div>
          {shrink ? (
            <div className="practice-stat">
              <strong data-testid="streak">{ring.streak}</strong>
              <small>in a row</small>
            </div>
          ) : (
            <div className="practice-stat">
              <strong>{formatPercent(summary.percentage)}%</strong>
              <small>accuracy</small>
            </div>
          )}
          <button className="button button--secondary practice-undo" type="button" disabled={!session.shots.length || busy} onClick={onUndo}>
            <Undo2 aria-hidden="true" />
            Undo last
          </button>
          {best ? (
            <p className="practice-best">
              <Trophy aria-hidden="true" /> Best to beat: <strong>{formatPercent(best.percentage)}%</strong>
            </p>
          ) : null}
        </footer>
      ) : (
        <footer className="practice-footer practice-footer--setup">
          <p>
            {shrink
              ? 'Drag the circle to aim and size the starting ring. Three in a row shrinks it.'
              : 'Drag the circle to aim. Use the handle to set its visual size.'}
          </p>
          <button className="button button--primary" type="button" disabled={busy} onClick={onSetTarget}>
            Set target
          </button>
        </footer>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave practice?"
        confirmLabel="Save and leave"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onLeave();
        }}
      >
        Your draft is already saved. You can resume it from Games.
      </ConfirmDialog>
    </AppShell>
  );
}

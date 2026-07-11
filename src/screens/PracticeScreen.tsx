import { useState } from 'react';
import { ChevronDown, Hand, Move, Undo2 } from 'lucide-react';
import type { PracticeSession, RangeMap, Target } from '../domain/types';
import type { NormalizedPoint } from '../components/RangeMapCanvas';
import { getSessionAccuracy } from '../domain/metrics';
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
  onTargetChange: (target: Target) => void;
  onSetTarget: () => void;
  onShot: (point: NormalizedPoint) => void;
  onUndo: () => void;
  onFinish: () => void;
  onLeave: () => void;
}

export function PracticeScreen({
  range,
  imageUrl,
  session,
  recording,
  busy,
  onTargetChange,
  onSetTarget,
  onShot,
  onUndo,
  onFinish,
  onLeave,
}: PracticeScreenProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const summary = getSessionAccuracy(session, range);

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
        <strong>{recording ? 'Tap where the ball landed' : 'Move and resize the target'}</strong>
      </div>

      <div className="practice-map-wrap">
        <RangeMapCanvas
          className="practice-map"
          imageUrl={imageUrl}
          imageWidth={range.width}
          imageHeight={range.height}
          target={session.target}
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
          <div className="practice-stat">
            <strong>{formatPercent(summary.percentage)}%</strong>
            <small>accuracy</small>
          </div>
          <button className="button button--secondary practice-undo" type="button" disabled={!session.shots.length || busy} onClick={onUndo}>
            <Undo2 aria-hidden="true" />
            Undo last
          </button>
        </footer>
      ) : (
        <footer className="practice-footer practice-footer--setup">
          <p>Drag the circle to aim. Use the handle to set its visual size.</p>
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
        Your draft is already saved. You can resume it from the home screen.
      </ConfirmDialog>
    </AppShell>
  );
}

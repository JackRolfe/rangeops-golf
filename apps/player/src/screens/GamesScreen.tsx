import { Clock3, Crosshair, Play, Shrink, Target } from 'lucide-react';
import type { GameMode, PracticeSession, RangeMap } from '../domain/types';
import { GAME_NAMES } from '../domain/games';
import { getLastNAccuracy, getSessionTrend } from '../domain/metrics';
import { formatChartDate, formatPercent } from '../domain/format';
import { AccuracyChart } from '../components/AccuracyChart';
import { AccuracyRing } from '../components/AccuracyRing';
import { AppShell } from '../components/AppShell';
import { TabBar, type TabId } from '../components/TabBar';
import { Brand } from '../components/Brand';
import { SessionRow } from '../components/SessionRow';

interface GamesScreenProps {
  range: RangeMap;
  ranges: RangeMap[];
  sessions: PracticeSession[];
  draft: PracticeSession | null;
  onStart: (mode: GameMode) => void;
  onResume: () => void;
  onDiscardDraft: () => void;
  onProgress: () => void;
  onSession: (session: PracticeSession) => void;
  onTab: (tab: TabId) => void;
}

/** The Games tab: start or resume a game, recent accuracy and recent sessions. */
export function GamesScreen({
  range,
  ranges,
  sessions,
  draft,
  onStart,
  onResume,
  onDiscardDraft,
  onProgress,
  onSession,
  onTab,
}: GamesScreenProps) {
  const completed = sessions
    .filter((session) => session.status === 'completed')
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const recentAccuracy = getLastNAccuracy(completed, ranges, 30);
  const trend = getSessionTrend(completed, ranges).slice(-7);
  const recent = completed.slice(0, 2);
  const ringValue = recentAccuracy.total ? formatPercent(recentAccuracy.percentage) : null;

  return (
    <AppShell>
      <header className="topbar">
        <Brand />
      </header>

      <div className="screen-scroll home-screen">
        <h1>{range.name}</h1>

        {draft ? (
          <section className="draft-rail" aria-label="Practice in progress">
            <div>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>Practice in progress</strong>
                <small>{draft.club} · {draft.shots.length} {draft.shots.length === 1 ? 'shot' : 'shots'}</small>
              </span>
            </div>
            <div className="draft-rail__actions">
              <button className="text-button" type="button" onClick={onDiscardDraft}>Discard</button>
              <button className="button button--secondary" type="button" onClick={onResume}>
                <Play aria-hidden="true" /> Resume
              </button>
            </div>
          </section>
        ) : null}

        <section className="home-summary" aria-labelledby="home-summary-title">
          <h2 className="sr-only" id="home-summary-title">Recent accuracy</h2>
          <AccuracyRing value={ringValue} label="on target" />
          <p>
            <strong>{recentAccuracy.total ? `Last ${recentAccuracy.total} shots` : 'No shots yet'}</strong>
            <span>{recentAccuracy.total ? `${recentAccuracy.onTarget} landed on target` : 'Your first session will appear here.'}</span>
          </p>
        </section>

        {draft ? null : (
          <section className="game-cards" aria-label="Choose a game">
            <button className="game-card" type="button" onClick={() => onStart('bullseye')}>
              <Crosshair aria-hidden="true" />
              <strong>{GAME_NAMES.bullseye}</strong>
              <span>Land it in the ring.</span>
            </button>
            <button className="game-card game-card--shrink" type="button" onClick={() => onStart('shrink')}>
              <Shrink aria-hidden="true" />
              <strong>{GAME_NAMES.shrink}</strong>
              <span>Three in a row shrinks the ring.</span>
            </button>
          </section>
        )}

        <section className="home-section">
          <h2 className="section-heading">Recent accuracy</h2>
          {trend.length ? (
            <AccuracyChart
              points={trend.map((point) => ({
                label: formatChartDate(point.recordedAt),
                value: point.percentage,
              }))}
              compact
            />
          ) : (
            <div className="home-chart-empty">
              <span className="home-chart-empty__line" />
              <span>Complete a session to start your trend.</span>
            </div>
          )}
        </section>

        <section className="home-section home-section--sessions">
          <div className="section-title-row">
            <h2 className="section-heading">Recent sessions</h2>
            {completed.length > 0 ? <button className="text-button" type="button" onClick={onProgress}>View all</button> : null}
          </div>
          {recent.length ? (
            <div className="session-list">
              {recent.map((session) => {
                const dimensions = ranges.find((item) => item.id === session.rangeId && item.revision === session.rangeRevision) ?? range;
                return <SessionRow key={session.id} session={session} dimensions={dimensions} onClick={() => onSession(session)} />;
              })}
            </div>
          ) : (
            <div className="empty-state">
              <Target aria-hidden="true" />
              <h3>No sessions yet</h3>
              <p>Pick a game, set the ring, and tap where each ball lands. Your progress builds as you play.</p>
            </div>
          )}
        </section>
      </div>

      <TabBar active="games" onSelect={onTab} />
    </AppShell>
  );
}

import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { PracticeSession, RangeMap } from '../domain/types';
import { filterSessionsByClub, getOverallAccuracy, getSessionTrend } from '../domain/metrics';
import { formatChartDate, formatPercent } from '../domain/format';
import { AccuracyChart } from '../components/AccuracyChart';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { SessionRow } from '../components/SessionRow';

interface HistoryScreenProps {
  range: RangeMap;
  ranges: RangeMap[];
  sessions: PracticeSession[];
  onHome: () => void;
  onStart: () => void;
  onSession: (session: PracticeSession) => void;
}

export function HistoryScreen({ range, ranges, sessions, onHome, onStart, onSession }: HistoryScreenProps) {
  const completed = useMemo(() => sessions.filter((session) => session.status === 'completed'), [sessions]);
  const clubs = useMemo(() => [...new Set(completed.map((session) => session.club))].sort(), [completed]);
  const [club, setClub] = useState('all');
  const filtered = useMemo(() => filterSessionsByClub(completed, club), [club, completed]);
  const newestFirst = useMemo(
    () => [...filtered].sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)),
    [filtered],
  );
  const accuracy = getOverallAccuracy(filtered, ranges);
  const trend = getSessionTrend(filtered, ranges);

  return (
    <AppShell>
      <header className="history-header">
        <h1>Progress</h1>
      </header>
      <div className="screen-scroll history-screen">
        <section className="history-summary">
          <div>
            <strong>{accuracy.total ? `${formatPercent(accuracy.percentage)}%` : '—'}</strong>
            <span>on target</span>
          </div>
          <label>
            <span className="sr-only">Filter by club</span>
            <select value={club} onChange={(event) => setClub(event.target.value)}>
              <option value="all">All clubs</option>
              {clubs.map((clubName) => <option value={clubName} key={clubName}>{clubName}</option>)}
            </select>
          </label>
        </section>

        <section className="history-section">
          <h2 className="section-heading">Accuracy by session</h2>
          <AccuracyChart
            points={trend.map((point) => ({ label: formatChartDate(point.recordedAt), value: point.percentage }))}
          />
        </section>

        <section className="history-section history-section--list">
          <h2 className="section-heading">Session history</h2>
          {newestFirst.length ? (
            <div className="session-list">
              {newestFirst.map((session) => {
                const dimensions = ranges.find((item) => item.id === session.rangeId && item.revision === session.rangeRevision) ?? range;
                return <SessionRow key={session.id} session={session} dimensions={dimensions} onClick={() => onSession(session)} />;
              })}
            </div>
          ) : (
            <div className="empty-state">
              <BarChart3 aria-hidden="true" />
              <h3>{club === 'all' ? 'No history yet' : `No ${club} sessions`}</h3>
              <p>{club === 'all' ? 'Completed practice sessions will appear here.' : 'Choose another club or record a new session.'}</p>
            </div>
          )}
        </section>
      </div>

      <BottomNav active="history" onNavigate={(view) => view === 'home' && onHome()} onPractice={onStart} />
    </AppShell>
  );
}

import type { PracticeSession, RangeMap } from '../domain/types';
import { getSessionAccuracy } from '../domain/metrics';
import { formatDate, formatPercent, pluralShots } from '../domain/format';
import { AppShell } from '../components/AppShell';
import { PageHeader } from '../components/PageHeader';
import { RangeMapCanvas } from '../components/RangeMapCanvas';

interface SessionDetailScreenProps {
  range: RangeMap;
  imageUrl: string;
  session: PracticeSession;
  onBack: () => void;
}

export function SessionDetailScreen({ range, imageUrl, session, onBack }: SessionDetailScreenProps) {
  const summary = getSessionAccuracy(session, range);

  return (
    <AppShell fullBleed className="detail-screen">
      <PageHeader title="Session" onBack={onBack} />
      <section className="detail-summary">
        <div>
          <h2>{session.club}</h2>
          <p>{formatDate(session.completedAt ?? session.updatedAt)} · {pluralShots(session.shots.length)}</p>
        </div>
        <strong>{formatPercent(summary.percentage)}%</strong>
      </section>
      {session.note ? <p className="detail-note">{session.note}</p> : null}
      <div className="detail-map-wrap">
        <RangeMapCanvas
          className="detail-map"
          imageUrl={imageUrl}
          imageWidth={range.width}
          imageHeight={range.height}
          target={session.target}
          shots={session.shots}
          mode="review"
          readOnly
        />
      </div>
      <footer className="detail-footer">
        <div><strong>{summary.onTarget}</strong><span>on target</span></div>
        <div><strong>{summary.total - summary.onTarget}</strong><span>missed</span></div>
        <div><strong>{summary.total}</strong><span>total</span></div>
      </footer>
    </AppShell>
  );
}

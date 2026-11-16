import { ChevronRight } from 'lucide-react';
import type { ImageDimensions, PracticeSession } from '../domain/types';
import { getSessionAccuracy } from '../domain/metrics';
import { formatDate, formatPercent, pluralShots } from '../domain/format';

interface SessionRowProps {
  session: PracticeSession;
  dimensions: ImageDimensions;
  onClick: () => void;
}

export function SessionRow({ session, dimensions, onClick }: SessionRowProps) {
  const accuracy = getSessionAccuracy(session, dimensions);
  const percent = formatPercent(accuracy.percentage);

  return (
    <button className="session-row" type="button" onClick={onClick}>
      <span className="session-row__main">
        <span className="session-row__title">
          {session.club}
          <time dateTime={session.completedAt ?? session.updatedAt}>
            {formatDate(session.completedAt ?? session.updatedAt)}
          </time>
        </span>
        <span className="session-row__meta">
          {pluralShots(session.shots.length)}{session.note ? ` · ${session.note}` : ''}
        </span>
      </span>
      <strong className={`session-row__score ${percent < 50 ? 'is-low' : ''}`}>{percent}%</strong>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

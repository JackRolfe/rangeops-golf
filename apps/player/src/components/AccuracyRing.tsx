interface AccuracyRingProps {
  value: number | null;
  label: string;
}

export function AccuracyRing({ value, label }: AccuracyRingProps) {
  const safeValue = value ?? 0;
  return (
    <div
      className={`accuracy-ring ${value === null ? 'is-empty' : ''}`}
      style={{ '--accuracy': `${safeValue * 3.6}deg` } as CSSProperties}
      aria-label={value === null ? 'No accuracy data yet' : `${value}% ${label}`}
    >
      <div className="accuracy-ring__inner">
        <strong>{value === null ? '—' : `${value}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
import type { CSSProperties } from 'react';

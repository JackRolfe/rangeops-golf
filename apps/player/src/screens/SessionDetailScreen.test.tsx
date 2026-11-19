// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BestSession } from '../domain/metrics';
import type { PracticeSession, RangeMap, Shot } from '../domain/types';
import { SessionDetailScreen } from './SessionDetailScreen';

afterEach(cleanup);

const range: RangeMap = {
  id: 'range-1',
  name: 'Range',
  imageBlob: new Blob(['x'], { type: 'image/png' }),
  width: 1000,
  height: 1000,
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const shot = (index: number, on: boolean): Shot => ({
  id: `shot-${index}`,
  x: on ? 0.5 : 0.95,
  y: 0.5,
  radius: 0.1,
  recordedAt: '2026-01-01T00:00:00.000Z',
});

const finished = (on: number, total: number): PracticeSession => ({
  id: 'session-new',
  rangeId: 'range-1',
  rangeRevision: 1,
  mode: 'bullseye',
  club: '7 iron',
  note: '',
  target: { cx: 0.5, cy: 0.5, radius: 0.1 },
  targetLocked: true,
  shots: Array.from({ length: total }, (_, index) => shot(index, index < on)),
  status: 'completed',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  completedAt: '2026-01-02T00:00:00.000Z',
});

const previous: BestSession = {
  sessionId: 'session-old',
  club: '7 iron',
  mode: 'bullseye',
  recordedAt: '2026-01-01T00:00:00.000Z',
  onTarget: 3,
  total: 5,
  percentage: 60,
};

function renderDetail(session: PracticeSession, previousBest: BestSession | null) {
  render(<SessionDetailScreen range={range} imageUrl="blob:map" session={session} previousBest={previousBest} onBack={vi.fn()} />);
}

describe('SessionDetailScreen, Beat Your Best', () => {
  it('says when a session beats the best', () => {
    renderDetail(finished(4, 5), previous);
    expect(screen.getByText('New best! You beat 60%.')).toBeInTheDocument();
  });

  it('shows the best still to beat when it falls short', () => {
    renderDetail(finished(2, 5), previous);
    expect(screen.getByText('Best to beat: 60%.')).toBeInTheDocument();
  });

  it('makes the first long enough session the best to beat', () => {
    renderDetail(finished(2, 5), null);
    expect(screen.getByText('That’s your best with 7 iron to beat next time.')).toBeInTheDocument();
  });

  it('asks for five shots before a session can set a best', () => {
    renderDetail(finished(2, 2), previous);
    expect(screen.getByText('Play 5 shots or more to set a best.')).toBeInTheDocument();
  });
});

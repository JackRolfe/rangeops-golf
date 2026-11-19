// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameMode, PracticeSession, RangeMap, Shot } from '../domain/types';
import { PracticeScreen } from './PracticeScreen';

const ringRadius = (container: HTMLElement): number =>
  Number(container.querySelector('[data-target-ring]')?.getAttribute('r'));

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

const hit = (index: number, radius = 0.1): Shot => ({
  id: `shot-${index}`,
  x: 0.5,
  y: 0.5,
  radius,
  recordedAt: `2026-01-01T00:00:0${index}.000Z`,
});

function session(mode: GameMode, shots: Shot[]): PracticeSession {
  return {
    id: 'session-1',
    rangeId: 'range-1',
    rangeRevision: 1,
    mode,
    club: '7 iron',
    note: '',
    target: { cx: 0.5, cy: 0.5, radius: 0.1 },
    targetLocked: true,
    shots,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
  };
}

function renderPractice(practice: PracticeSession) {
  return render(
    <PracticeScreen
      range={range}
      imageUrl="blob:map"
      session={practice}
      recording
      busy={false}
      best={null}
      onTargetChange={vi.fn()}
      onSetTarget={vi.fn()}
      onShot={vi.fn()}
      onUndo={vi.fn()}
      onFinish={vi.fn()}
      onLeave={vi.fn()}
    />,
  );
}

describe('PracticeScreen in Shrink the Ring', () => {
  it('draws the shrunken ring after three hits in a row and shows the streak', () => {
    const { container } = renderPractice(session('shrink', [hit(1), hit(2), hit(3)]));
    expect(ringRadius(container)).toBeCloseTo(80);
    expect(screen.getByText('The ring shrank to 80%.')).toBeInTheDocument();
    expect(screen.getByTestId('streak')).toHaveTextContent('3');
  });

  it('counts down to the next shrink', () => {
    const { container } = renderPractice(session('shrink', [hit(1)]));
    expect(ringRadius(container)).toBeCloseTo(100);
    expect(screen.getByText('2 more in a row to shrink the ring.')).toBeInTheDocument();
  });
});

describe('PracticeScreen in Bullseye', () => {
  it('keeps the ring and shows accuracy', () => {
    const { container } = renderPractice(session('bullseye', [hit(1), hit(2), hit(3)]));
    expect(ringRadius(container)).toBeCloseTo(100);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByTestId('streak')).not.toBeInTheDocument();
  });
});

describe('PracticeScreen, Beat Your Best', () => {
  it('shows the best to beat for this club and game', () => {
    render(
      <PracticeScreen
        range={range}
        imageUrl="blob:map"
        session={session('bullseye', [hit(1)])}
        recording
        busy={false}
        best={{ sessionId: 'old', club: '7 iron', mode: 'bullseye', recordedAt: '2026-01-01T00:00:00.000Z', onTarget: 7, total: 10, percentage: 70 }}
        onTargetChange={vi.fn()}
        onSetTarget={vi.fn()}
        onShot={vi.fn()}
        onUndo={vi.fn()}
        onFinish={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Best to beat/)).toHaveTextContent('Best to beat: 70%');
  });
});

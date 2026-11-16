// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccuracyChart } from './AccuracyChart';

afterEach(cleanup);

describe('AccuracyChart', () => {
  it('renders a labelled empty state without a trend line', () => {
    const { container } = render(<AccuracyChart points={[]} />);

    expect(screen.getByRole('img', { name: /accuracy by practice session/i })).toBeInTheDocument();
    expect(screen.getByText(/complete a session to see your trend/i)).toBeInTheDocument();
    expect(container.querySelector('path[d^="M"]')).not.toBeInTheDocument();
  });

  it('renders and labels a single session point', () => {
    render(<AccuracyChart points={[{ label: '11 Jul', value: 72.4 }]} />);

    expect(screen.getByRole('img', { name: '11 Jul: 72% accuracy' })).toBeInTheDocument();
    expect(screen.getByText('11 Jul')).toBeInTheDocument();
  });

  it('clamps data to the 0–100 chart range', () => {
    render(
      <AccuracyChart
        points={[
          { label: 'First', value: -20 },
          { label: 'Second', value: 140 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'First: 0% accuracy' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Second: 100% accuracy' })).toBeInTheDocument();
  });
});

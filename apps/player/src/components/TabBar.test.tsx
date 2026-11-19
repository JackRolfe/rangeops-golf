// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABS, TabBar } from './TabBar';

afterEach(cleanup);

describe('TabBar', () => {
  it('puts Games first', () => {
    expect(TABS[0].id).toBe('games');
  });

  it('marks the current tab and reports the tab chosen', () => {
    const onSelect = vi.fn();
    render(<TabBar active="games" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Games' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });
});

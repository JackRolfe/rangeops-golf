// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ConfirmDialog', () => {
  it('isolates background content, traps focus, handles Escape, and restores focus', async () => {
    const user = userEvent.setup();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.appendChild(opener);
    opener.focus();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConfirmDialog
        open
        title="Leave practice?"
        confirmLabel="Save and leave"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Your draft is saved.
      </ConfirmDialog>,
      { container: root },
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const close = screen.getByRole('button', { name: 'Close' });
    const confirm = screen.getByRole('button', { name: 'Save and leave' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(root).toHaveAttribute('inert');
    expect(root).toHaveAttribute('aria-hidden', 'true');

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <ConfirmDialog
        open={false}
        title="Leave practice?"
        confirmLabel="Save and leave"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Your draft is saved.
      </ConfirmDialog>,
    );
    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-hidden');
    expect(opener).toHaveFocus();
  });
});

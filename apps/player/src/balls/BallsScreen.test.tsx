// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAccount } from '../test/renderWithAccount';
import { BallsScreen } from './BallsScreen';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function buy(rowName: RegExp) {
  const row = screen.getAllByRole('listitem').find((item) => rowName.test(item.textContent ?? ''))!;
  fireEvent.click(within(row).getByRole('button', { name: 'Buy' }));
}

describe('BallsScreen', () => {
  it('buys a bucket by card and shows its code, which stays in the wallet', async () => {
    await renderWithAccount(<BallsScreen onTab={vi.fn()} />, { signedInAs: 'kid@example.test' });
    buy(/Medium bucket/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pay $16.00' })));
    const code = (await screen.findByLabelText(/Bucket code/)).textContent!;
    expect(code).toMatch(/^\d{6}$/);
    expect(screen.getByText('Show this code at the counter for 100 balls.')).toBeInTheDocument();
    const wallet = screen.getByRole('region', { name: 'Your balls and passes' });
    await waitFor(() => expect(within(wallet).getByText(code)).toBeInTheDocument());
  });

  it('buys ball credit and spends it on a bucket', async () => {
    await renderWithAccount(<BallsScreen onTab={vi.fn()} />, { signedInAs: 'kid@example.test' });
    await act(async () => buy(/500 ball credit/));
    expect(await screen.findByText('You now have 500 balls of credit.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('ball-credit')).toHaveTextContent('500 balls'));
    buy(/Large bucket/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use 150 balls of credit' })));
    expect(await screen.findByLabelText(/Bucket code/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('ball-credit')).toHaveTextContent('350 balls'));
  });

  it('won’t spend credit you don’t have, and sells a monthly pass', async () => {
    await renderWithAccount(<BallsScreen onTab={vi.fn()} />, { signedInAs: 'kid@example.test' });
    buy(/Small bucket/);
    expect(screen.getByRole('button', { name: 'Not enough ball credit (0)' })).toBeDisabled();
    await act(async () => buy(/Monthly pass/));
    expect(await screen.findByText(/Monthly pass: 20% off bays and buckets until/)).toBeInTheDocument();
    const wallet = screen.getByRole('region', { name: 'Your balls and passes' });
    await waitFor(() => expect(within(wallet).getByText('Monthly pass')).toBeInTheDocument());
  });

  it('shows prices signed out, and asks for sign-in to buy', async () => {
    await renderWithAccount(<BallsScreen onTab={vi.fn()} />);
    expect(screen.getByText('Small bucket')).toBeInTheDocument();
    buy(/Small bucket/);
    expect(screen.getByText(/Sign in to buy balls. You’ll come straight back here./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your balls and passes' })).not.toBeInTheDocument();
  });
});

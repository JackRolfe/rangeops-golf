// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountProvider } from '../account/AccountContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_CARD } from '../api/types';
import { decodeHireKey } from '../robot/protocol';
import { renderWithAccount } from '../test/renderWithAccount';
import { CheckInScreen } from './CheckInScreen';

// 12:50 in Sydney on Wednesday 2 December 2026; the booking is at 13:00.
let now = new Date('2026-12-02T01:50:00.000Z');

beforeEach(() => {
  localStorage.clear();
  now = new Date('2026-12-02T01:50:00.000Z');
});
afterEach(cleanup);

describe('CheckInScreen', () => {
  it('checks in to this bay’s booking and offers Drive with its hire key', async () => {
    const onDrive = vi.fn();
    const { account, fake } = await renderWithAccount(<div />, { now: () => now, signedInAs: 'parent@example.test' });
    await act(async () => {
      now = new Date('2026-12-01T01:00:00.000Z');
      await account().api.createBooking({ bayId: 'bay-3', startsAt: '2026-12-02T02:00:00.000Z', addOns: [{ kind: 'robot' }], paymentMethod: TEST_CARD });
      now = new Date('2026-12-02T01:50:00.000Z');
    });
    // Open the QR link now, with the same API and the session saved on the device.
    cleanup();
    await act(async () => {
      render(
        <AccountProvider createApi={() => fake}>
          <CheckInScreen code={fake.checkInCodeFor(3)} onTab={vi.fn()} onDrive={onDrive} />
        </AccountProvider>,
      );
    });
    expect(await screen.findByRole('heading', { name: 'You’re checked in at Bay 3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drive Mulligan A1B2' }));
    expect(decodeHireKey(onDrive.mock.calls[0][0])).toMatchObject({ serial: 'A1B2', bay: 3 });
  });

  it('says so for a code that is not a bay', async () => {
    await renderWithAccount(<CheckInScreen code="not-a-bay" onTab={vi.fn()} onDrive={vi.fn()} />, { now: () => now, signedInAs: 'a@example.test' });
    expect(await screen.findByRole('alert')).toHaveTextContent("That QR code isn't a RangeOps bay.");
  });

  it('asks a signed-out player to sign in, then checks in by itself', async () => {
    const { fake } = await renderWithAccount(<CheckInScreen code="check-in-bay-5" onTab={vi.fn()} onDrive={vi.fn()} />, { now: () => now });
    expect(screen.getByText(/Sign in to check in at this bay/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'late@example.test' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open the sign-in link' })));
    // Signed in, with no booking at Bay 5 now: the API's answer shows.
    expect(await screen.findByRole('alert')).toHaveTextContent('You have no booking at Bay 5 right now.');
    expect(fake).toBeDefined();
  });
});

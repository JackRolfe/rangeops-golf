// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECLINED_TEST_CARD } from '../api/types';
import { decodeHireKey } from '../robot/protocol';
import { renderWithAccount } from '../test/renderWithAccount';
import { BookScreen } from './BookScreen';

// Wednesday 2 December 2026, 12:00 in Sydney.
const NOW = new Date('2026-12-02T01:00:00.000Z');
const now = () => NOW;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function chooseFirstTimeTomorrow() {
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Tomorrow' })));
  const times = await screen.findByRole('group', { name: 'Time' });
  await waitFor(() => expect(within(times).getAllByRole('button').length).toBeGreaterThan(0));
  fireEvent.click(within(times).getAllByRole('button')[0]);
}

describe('BookScreen', () => {
  it('books a bay with a robot, offers Drive with its hire key, and lists it', async () => {
    const onDrive = vi.fn();
    await renderWithAccount(<BookScreen onTab={vi.fn()} onDrive={onDrive} now={now} />, { now, signedInAs: 'parent@example.test' });
    await chooseFirstTimeTomorrow();
    expect(within(screen.getByRole('group', { name: 'Bay' })).getByRole('button', { name: 'Bay 1' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: /Mulligan robot/ }));
    // 07:00 Thursday is off-peak: $18 for the bay and $15 for the robot.
    const pay = screen.getByRole('button', { name: 'Pay $33.00' });
    await act(async () => fireEvent.click(pay));

    expect(await screen.findByRole('heading', { name: 'You’re booked' })).toBeInTheDocument();
    expect(screen.getByText(/Bay 1, Thu 3 Dec, 07:00–08:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drive Mulligan A1B2' }));
    const key = onDrive.mock.calls[0][0] as Uint8Array;
    expect(decodeHireKey(key)).toMatchObject({ serial: 'A1B2', bay: 1 });

    const yours = screen.getByRole('region', { name: 'Your bookings' });
    await waitFor(() => expect(within(yours).getByText('Thu 3 Dec, 07:00–08:00')).toBeInTheDocument());
    expect(within(yours).getByText(/Bay 1 · RangeOps Demo Range · Mulligan robot/)).toBeInTheDocument();
  });

  it('cancels an upcoming booking with a refund', async () => {
    await renderWithAccount(<BookScreen onTab={vi.fn()} onDrive={vi.fn()} now={now} />, { now, signedInAs: 'parent@example.test' });
    await chooseFirstTimeTomorrow();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Pay / })));
    const yours = screen.getByRole('region', { name: 'Your bookings' });
    await act(async () => fireEvent.click(await within(yours).findByRole('button', { name: 'Cancel' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' })));
    await waitFor(() => expect(within(yours).getByText('Nothing booked yet.')).toBeInTheDocument());
    expect(within(yours).getByText(/cancelled and refunded/)).toBeInTheDocument();
  });

  it('says so when the card is declined', async () => {
    await renderWithAccount(<BookScreen onTab={vi.fn()} onDrive={vi.fn()} now={now} paymentMethod={DECLINED_TEST_CARD} />, {
      now,
      signedInAs: 'parent@example.test',
    });
    await chooseFirstTimeTomorrow();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Pay / })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.');
    expect(screen.queryByRole('heading', { name: 'You’re booked' })).not.toBeInTheDocument();
  });

  it('lets anyone look, and asks for sign-in only to pay', async () => {
    await renderWithAccount(<BookScreen onTab={vi.fn()} onDrive={vi.fn()} now={now} />, { now });
    await chooseFirstTimeTomorrow();
    expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in to pay for this booking/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your bookings' })).not.toBeInTheDocument();
  });

  it('leaves out the robot when none is free', async () => {
    const { fake, account } = await renderWithAccount(<BookScreen onTab={vi.fn()} onDrive={vi.fn()} now={now} />, { now, signedInAs: 'a@example.test' });
    const startsAt = '2026-12-02T20:00:00.000Z'; // 07:00 Thursday
    await act(async () => {
      await account().api.createBooking({ bayId: 'bay-7', startsAt, addOns: [{ kind: 'robot' }], paymentMethod: 'pm_fake_ok' });
      await account().api.createBooking({ bayId: 'bay-8', startsAt, addOns: [{ kind: 'robot' }], paymentMethod: 'pm_fake_ok' });
    });
    expect(fake.robots).toHaveLength(2);
    await chooseFirstTimeTomorrow();
    expect(screen.getByRole('checkbox', { name: /Mulligan robot/ })).toBeDisabled();
    expect(screen.getByText('No robot is free then')).toBeInTheDocument();
  });
});

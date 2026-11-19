// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakePlayerApi } from '../api/FakePlayerApi';
import type { AuthHooks } from '../api/PlayerApi';
import { AccountProvider, useAccount } from './AccountContext';
import { AccountSection } from './AccountSection';
import { SESSION_KEY } from './session';

let fake: FakePlayerApi;
const createApi = (auth: AuthHooks) => (fake = new FakePlayerApi({ auth, appUrl: 'http://localhost/app' }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderAccount() {
  return render(
    <AccountProvider createApi={createApi}>
      <AccountSection />
    </AccountProvider>,
  );
}

async function signInByDemoLink(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' })));
  expect(screen.getByRole('status')).toHaveTextContent(`We’ve sent a sign-in link to ${email}`);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open the sign-in link' })));
}

describe('signing in by email link', () => {
  it('signs in from the link, keeps the session on the device, and signs out', async () => {
    renderAccount();
    expect(screen.getByText(/Games and your practice history work without an account/)).toBeInTheDocument();
    await signInByDemoLink('kid@example.test');
    expect(screen.getByText('kid@example.test')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).account.email).toBe('kid@example.test');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('says so when a link is unknown or used', async () => {
    let account: ReturnType<typeof useAccount> | undefined;
    function Probe() {
      account = useAccount();
      return null;
    }
    render(
      <AccountProvider createApi={createApi}>
        <Probe />
      </AccountProvider>,
    );
    await expect(account!.verifyLink('used-token')).rejects.toThrow(/unknown, used or expired/);
  });

  it('drops a session the API no longer accepts', async () => {
    let account: ReturnType<typeof useAccount> | undefined;
    function Probe() {
      account = useAccount();
      return <span>{account.session ? 'signed in' : 'signed out'}</span>;
    }
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ sessionToken: 'stale', expiresAt: '2999-01-01T00:00:00.000Z', account: { id: 'a', email: 'old@example.test', name: null, createdAt: '' } }),
    );
    render(
      <AccountProvider createApi={createApi}>
        <Probe />
      </AccountProvider>,
    );
    expect(screen.getByText('signed in')).toBeInTheDocument();
    await act(async () => {
      await account!.api.getWallet().catch(() => {});
    });
    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(fake).toBeDefined();
  });
});

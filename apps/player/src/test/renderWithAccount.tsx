import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AccountProvider, useAccount, type AccountState } from '../account/AccountContext';
import { FakePlayerApi } from '../api/FakePlayerApi';

/** Renders `ui` inside an AccountProvider backed by a FakePlayerApi, optionally signed in. */
export async function renderWithAccount(ui: ReactNode, options: { now?: () => Date; signedInAs?: string } = {}) {
  let fake!: FakePlayerApi;
  let account!: AccountState;
  function Probe() {
    account = useAccount();
    return null;
  }
  const result = render(
    <AccountProvider createApi={(auth) => (fake = new FakePlayerApi({ auth, now: options.now, appUrl: 'http://localhost/app' }))}>
      <Probe />
      {ui}
    </AccountProvider>,
  );
  // Let the first loads (the range, the bookings) finish inside act.
  await act(async () => {})
  if (options.signedInAs) {
    await act(async () => {
      const { demoLink } = await account.requestLink(options.signedInAs!);
      await account.verifyLink(new URL(demoLink!).searchParams.get('token')!);
    });
  }
  return { ...result, fake, account: () => account };
}

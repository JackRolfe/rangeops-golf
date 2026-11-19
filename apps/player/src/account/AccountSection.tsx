import { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { apiErrorMessage, useAccount } from './AccountContext';
import { SignInCard } from './SignInCard';

interface AccountSectionProps {
  /** A message from opening a sign-in link, if the app was opened with one. */
  linkMessage?: { kind: 'ok' | 'error'; text: string } | null;
}

/** Settings' account section: who is signed in, or a way to sign in. */
export function AccountSection({ linkMessage }: AccountSectionProps) {
  const { api, session, signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="account-section">
      {linkMessage ? (
        <p className={linkMessage.kind === 'ok' ? 'success-note' : 'notice'} role={linkMessage.kind === 'ok' ? 'status' : 'alert'}>
          {linkMessage.text}
        </p>
      ) : null}
      {session ? (
        <section aria-labelledby="account-title">
          <h2 className="section-heading" id="account-title">Account</h2>
          <div className="account-row">
            <UserRound aria-hidden="true" />
            <span>
              Signed in as <strong>{session.account.email}</strong>
            </span>
          </div>
          {api.mode === 'demo' ? <p className="demo-note">Demo mode: nothing is booked or charged.</p> : null}
          <button
            className="button button--secondary button--full"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setProblem(null);
              signOut()
                .catch((error: unknown) => setProblem(apiErrorMessage(error)))
                .finally(() => setBusy(false));
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </button>
          {problem ? <p className="notice" role="alert">{problem}</p> : null}
        </section>
      ) : (
        <SignInCard reason="Sign in to book a bay, buy balls and hire Mulligan. Games and your practice history work without an account." />
      )}
    </div>
  );
}

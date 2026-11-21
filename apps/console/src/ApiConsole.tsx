import { useEffect, useMemo, useState } from 'react';
import App from './App';
import { ConsoleProvider } from './api/context';
import { HttpConsoleApi } from './api/http/HttpConsoleApi';
import { checkSession, loadSession, saveSession, signOut, type StaffSession } from './api/http/session';
import { SignIn } from './components/SignIn';

const clock = () => new Date();

/** The console against the RangeOps API: staff sign in, then every screen talks to HttpConsoleApi. */
export function ApiConsole({ baseUrl, preferredRange }: { baseUrl: string; preferredRange?: string }) {
  const [session, setSession] = useState<StaffSession | null>(() => loadSession(baseUrl));
  // A saved session is checked once before use: its token may have expired, or the local database reset.
  const [checked, setChecked] = useState(session === null);

  const forget = () => {
    saveSession(null);
    setSession(null);
  };

  useEffect(() => {
    if (checked || !session) return;
    let live = true;
    checkSession(session)
      .then((good) => {
        if (!live) return;
        saveSession(good);
        setSession(good);
      })
      .catch(() => {
        // The API is down: keep the session, and let the screens say they can't load.
      })
      .finally(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [checked, session]);

  const api = useMemo(
    () => (session ? new HttpConsoleApi({ baseUrl: session.baseUrl, token: session.token, rangeId: session.rangeId, onUnauthorized: forget }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );

  if (!checked) return <p className="empty sign-in">Checking your sign-in…</p>;

  if (!session || !api) {
    return (
      <SignIn
        baseUrl={baseUrl}
        preferredRange={preferredRange}
        onSignedIn={(next) => {
          saveSession(next);
          setSession(next);
        }}
      />
    );
  }

  return (
    <ConsoleProvider api={api} clock={clock}>
      <App
        account={{
          email: session.email,
          rangeName: session.rangeName,
          onSignOut: () => {
            void signOut(session);
            forget();
          },
        }}
      />
    </ConsoleProvider>
  );
}

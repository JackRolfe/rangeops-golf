import { useMemo, useState } from 'react';
import App from './App';
import { ConsoleProvider } from './api/context';
import { HttpConsoleApi } from './api/http/HttpConsoleApi';
import { loadSession, saveSession, signOut, type StaffSession } from './api/http/session';
import { SignIn } from './components/SignIn';

const clock = () => new Date();

/** The console against the RangeOps API: staff sign in, then every screen talks to HttpConsoleApi. */
export function ApiConsole({ baseUrl, preferredRange }: { baseUrl: string; preferredRange?: string }) {
  const [session, setSession] = useState<StaffSession | null>(() => loadSession(baseUrl));

  const forget = () => {
    saveSession(null);
    setSession(null);
  };

  const api = useMemo(
    () => (session ? new HttpConsoleApi({ baseUrl: session.baseUrl, token: session.token, rangeId: session.rangeId, onUnauthorized: forget }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );

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

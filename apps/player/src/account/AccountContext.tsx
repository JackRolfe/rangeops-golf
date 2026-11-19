import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPlayerApi } from '../api/createPlayerApi';
import { ApiError, type AuthHooks, type PlayerApi } from '../api/PlayerApi';
import type { Session } from '../api/types';
import { clearSession, loadSession, saveSession } from './session';

export interface AccountState {
  api: PlayerApi;
  session: Session | null;
  /** Sends a sign-in link. In demo mode, returns it, since nothing is emailed. */
  requestLink: (email: string) => Promise<{ demoLink?: string }>;
  /** Signs in with the token from a link. */
  verifyLink: (token: string) => Promise<Session>;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountState | null>(null);

interface AccountProviderProps {
  children: ReactNode;
  /** Tests pass a FakePlayerApi; the app takes VITE_API_URL's. */
  createApi?: (auth: AuthHooks) => PlayerApi;
}

export function AccountProvider({ children, createApi = createPlayerApi }: AccountProviderProps) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const token = useRef<string | null>(session?.sessionToken ?? null);

  const forget = useCallback(() => {
    token.current = null;
    clearSession();
    setSession(null);
  }, []);

  // One API for the app's lifetime; it reads the token through the ref.
  const [api] = useState(() => createApi({ getToken: () => token.current, onUnauthorized: () => forget() }));

  const value = useMemo<AccountState>(
    () => ({
      api,
      session,
      requestLink: (email) => api.requestSignInLink(email.trim()),
      verifyLink: async (linkToken) => {
        const next = await api.verifySignIn(linkToken);
        token.current = next.sessionToken;
        saveSession(next);
        setSession(next);
        return next;
      },
      signOut: async () => {
        try {
          await api.signOut();
        } catch (error) {
          // Signed out on the device either way; a dead session is already gone.
          if (!(error instanceof ApiError)) throw error;
        } finally {
          forget();
        }
      },
    }),
    [api, forget, session],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount needs an AccountProvider.');
  return value;
}

/** A message for any failed API call. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

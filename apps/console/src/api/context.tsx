import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Clock, ConsoleApi } from './ConsoleApi';

interface ConsoleContextValue {
  api: ConsoleApi;
  clock: Clock;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ api, clock, children }: ConsoleContextValue & { children: ReactNode }) {
  return <ConsoleContext.Provider value={{ api, clock }}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole needs a ConsoleProvider.');
  return value;
}

export type Loaded<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

/**
 * Loads data through the console API and reloads it on demand, or every `refreshMs`.
 * Keeps showing the last good data while a reload is in flight.
 */
export function useLoad<T>(load: (api: ConsoleApi) => Promise<T>, deps: unknown[], refreshMs?: number) {
  const { api } = useConsole();
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current(api);
      setState({ status: 'ready', data });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ...deps]);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(timer);
  }, [reload, refreshMs]);

  return { state, reload };
}

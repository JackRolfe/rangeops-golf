import type { Loaded } from '../api/context';
import type { ReactElement } from 'react';

/** Renders loading and error states, and the children once the data is ready. */
export function Status<T>({ state, children }: { state: Loaded<T>; children: (data: T) => ReactElement }) {
  if (state.status === 'loading') return <p className="empty">Loading…</p>;
  if (state.status === 'error') return <p className="error-list" role="alert">Couldn’t load: {state.error}</p>;
  return children(state.data);
}

export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="error-list" role="alert">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

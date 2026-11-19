import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import '@rangeops/brand/tokens.css';
import App from './App';
import { ApiConsole } from './ApiConsole';
import { ConsoleProvider } from './api/context';
import { FakeConsoleApi } from './api/FakeConsoleApi';
import './styles.css';

// Which data source the console runs against. Set VITE_CONSOLE_API (for example
// http://localhost:8787, or `npm run dev:api`) to use the RangeOps API; leave it unset for the
// in-memory demo range, which is also what the tests use.
const apiUrl = import.meta.env.VITE_CONSOLE_API as string | undefined;
const rangeId = import.meta.env.VITE_CONSOLE_RANGE as string | undefined;

function FakeConsole() {
  // `?now=2026-11-19T17:10` starts the demo clock at that local time, and it runs on from there:
  // handy for demos out of hours and for the smoke test.
  const startAt = new URLSearchParams(window.location.search).get('now');
  const offset = startAt && !Number.isNaN(Date.parse(startAt)) ? Date.parse(startAt) - Date.now() : 0;
  const clock = () => new Date(Date.now() + offset);
  const [api] = React.useState(() => new FakeConsoleApi({ clock }));
  return (
    <ConsoleProvider api={api} clock={clock}>
      <App />
    </ConsoleProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{apiUrl ? <ApiConsole baseUrl={apiUrl} preferredRange={rangeId} /> : <FakeConsole />}</React.StrictMode>,
);

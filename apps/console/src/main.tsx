import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import '@rangeops/brand/tokens.css';
import App from './App';
import { ConsoleProvider } from './api/context';
import { FakeConsoleApi } from './api/FakeConsoleApi';
import './styles.css';

// The in-memory demo range until the console is pointed at apps/api (ticket 11).
// `?now=2026-11-19T17:10` starts the demo clock at that local time, and it runs on from there:
// handy for demos out of hours and for the smoke test.
const startAt = new URLSearchParams(window.location.search).get('now');
const offset = startAt && !Number.isNaN(Date.parse(startAt)) ? Date.parse(startAt) - Date.now() : 0;
const clock = () => new Date(Date.now() + offset);
const api = new FakeConsoleApi({ clock });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConsoleProvider api={api} clock={clock}>
      <App />
    </ConsoleProvider>
  </React.StrictMode>,
);

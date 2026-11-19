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
const clock = () => new Date();
const api = new FakeConsoleApi({ clock });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConsoleProvider api={api} clock={clock}>
      <App />
    </ConsoleProvider>
  </React.StrictMode>,
);

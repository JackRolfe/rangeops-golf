/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '@fontsource-variable/figtree';
declare module '@fontsource-variable/bricolage-grotesque';

interface ImportMetaEnv {
  /** The RangeOps API, for example http://localhost:8787. Unset: demo mode, with the in-memory fake. */
  readonly VITE_API_URL?: string
}

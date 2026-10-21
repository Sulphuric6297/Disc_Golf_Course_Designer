/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1": built for a HyzerLab server (sign-in, accounts); unset: the browser-only demo. */
  readonly VITE_SERVER?: string;
}

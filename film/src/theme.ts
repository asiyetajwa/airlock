import { continueRender, delayRender, staticFile } from 'remotion';

// Airlock's look: navy and lavender, periwinkle blue, Nunito Sans.
export const theme = {
  bg: '#d7d8ee',
  lav: '#e6e7f5',
  navy: '#2a2950',
  navy2: '#1d1c3a',
  navy3: '#3a3a6a',
  ink: '#23223f',
  muted: '#6b6b8f',
  onNavy: '#f1f1fb',
  onNavy2: '#a9aad3',
  blue: '#6c7cf5',
  blue2: '#8f9dff',
  coral: '#ff6b6b',
  mint: '#3ccf9a',
  font: "'Nunito Sans', system-ui, sans-serif",
} as const;

let fontsRequested = false;

/** Loads Nunito Sans (SIL Open Font License) before the first frame renders. */
export function ensureFonts(): void {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  const handle = delayRender('Loading fonts');
  new FontFace('Nunito Sans', `url(${staticFile('fonts/nunito-sans-variable.woff2')}) format('woff2')`, { weight: '200 1000' })
    .load()
    .then((f) => {
      document.fonts.add(f);
    })
    .catch((err: unknown) => {
      console.error(err);
    })
    .finally(() => {
      continueRender(handle);
    });
}

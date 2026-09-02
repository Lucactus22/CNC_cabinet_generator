/**
 * Light or dark, and who decides.
 *
 * R-23's problem statement: the interface was dark only, in a tool used in
 * daylight and under workshop lights. The palette itself lives entirely in
 * `styles.css` as `light-dark(light, dark)` pairs under `color-scheme`, so the
 * system preference is followed with no JavaScript at all and there is no
 * flash of the wrong theme on load. This module is only the *override* — one
 * attribute on `<html>` when somebody has chosen — plus the one thing CSS
 * cannot hand out: which half is actually in force, for the 3D view, whose
 * scene colours are three.js materials rather than stylesheet rules.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: ReadonlyArray<{ id: ThemeChoice; label: string; title: string }> = [
  { id: 'system', label: 'System', title: 'Follow whatever this device is set to' },
  { id: 'light', label: 'Light', title: 'For daylight and bright workshop lights' },
  { id: 'dark', label: 'Dark', title: 'For a dim room' },
];

export const isThemeChoice = (v: unknown): v is ThemeChoice =>
  v === 'system' || v === 'light' || v === 'dark';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * Put the choice on `<html>`. `system` removes the attribute rather than
 * writing a value, which is what hands the decision back to `color-scheme`.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Which half of every `light-dark()` pair is actually painting right now. */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  // No `matchMedia` at all (a test environment, an old browser) reads as the
  // shipped default rather than throwing.
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

/**
 * Call back when the *device* changes its mind. Only matters while the choice
 * is `system`; the caller re-resolves rather than being told what changed,
 * because the answer depends on the choice as well as the device.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Whether this device has asked for less movement, right now. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Call back when that answer changes.
 *
 * The CSS rule that turns the transitions off re-evaluates by itself; the 3D
 * view's orbit damping is a three.js flag and cannot, so it subscribes. Asking
 * for less movement and then having to reload before the camera stops coasting
 * would be a promise half kept.
 */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const handler = (e: MediaQueryListEvent): void => onChange(e.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

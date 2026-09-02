import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

/**
 * Keyboard behaviour for the things that open over the bench.
 *
 * R-23's keyboard pass found the same two holes in every overlay in the app.
 * A popover opened with the keyboard could not be closed with it — Escape was
 * handled globally for the overlays the *store* knows about, and the ☰ menu
 * and the add-a-cabinet menu are local state, so neither answered. And a modal
 * left focus behind it on the page underneath: Tab from an open dialog walked
 * into the sixty controls it was covering, which is both a trap for a screen
 * reader and a way to change a parameter you cannot see.
 *
 * Both hooks are deliberately small and unopinionated about markup. Neither
 * renders anything, and neither owns the Escape key exclusively — the global
 * shortcut in TopBar still shuts everything the store holds.
 *
 * **Both register once and read the current callback from a ref.** That is not
 * tidiness; it is the fix for a real defect the pass walked into. The
 * measurement walkthrough registered its own Escape listener keyed on the
 * `onClose` prop it was handed, and `RunInspector` hands it a fresh arrow
 * function every render — so the listener was torn down and rebuilt on every
 * render. The global Escape handler runs first, on the same key press, and its
 * store update re-renders the inspector *during the dispatch*: by the time the
 * event reached the walkthrough's listener the DOM had marked it removed, and
 * its replacement had been added too late to be called. Escape simply did
 * nothing, for the one dialog in the app you most want to back out of. A
 * listener whose identity never changes cannot be caught by that.
 */

/** Everything a browser will put focus on, inside a given root. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// `getClientRects()` rather than `offsetParent`, which is null for anything
// positioned `fixed` — which is exactly what these overlays are.
const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );

/** The latest value of something, readable from a listener registered once. */
function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * A popover that shuts on Escape or on a press outside it.
 *
 * `pointerdown` rather than `click`: a press that starts inside the popover
 * and finishes outside it — dragging to select the name of a saved design —
 * is not somebody asking for it to close.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  close: () => void,
): RefObject<T> {
  const host = useRef<T>(null);
  const latest = useLatest(close);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Put focus back on whatever opened it, rather than dropping it on the
      // body — Escape should leave the keyboard where the hand thinks it is.
      const opener = host.current?.querySelector<HTMLElement>('[aria-expanded]');
      latest.current();
      opener?.focus();
    };
    const onDown = (e: PointerEvent): void => {
      if (!host.current?.contains(e.target as Node)) latest.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, latest]);
  return host;
}

/**
 * A modal: focus moves into it when it opens, is held inside it while it is
 * up, Escape backs out of it, and focus goes back where it came from.
 *
 * The dialog is focused itself rather than its first control, so a screen
 * reader reads the thing's own name before its buttons, and so opening the
 * export preview does not land on the Cancel button as though that were the
 * offer. Give the element `tabIndex={-1}` for that to be possible.
 *
 * `onClose` is optional: the overlays the store owns are already shut by the
 * global Escape shortcut, and passing it again would be harmless but
 * redundant. Anything held in a component's own state has to pass it.
 */
export function useDialog<T extends HTMLElement>(onClose?: () => void): RefObject<T> {
  const host = useRef<T>(null);
  const latest = useLatest(onClose);
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    host.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        latest.current?.();
        return;
      }
      if (e.key !== 'Tab' || !host.current) return;
      const stops = focusableIn(host.current);
      // A dialog with nothing focusable in it still must not leak Tab to the
      // page underneath; holding focus on the dialog itself is the honest
      // answer, and one it can always give.
      if (stops.length === 0) {
        e.preventDefault();
        host.current.focus();
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const on = document.activeElement;
      if (!e.shiftKey && (on === last || on === host.current)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (on === first || on === host.current)) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // React runs this cleanup before the effects of whatever the same
      // commit mounted, so a dialog that closes itself *by* sending you to a
      // control — the command palette's whole purpose — still ends with focus
      // on the control: `useReveal` claims it a moment after this line.
      //
      // `document.body` is not somewhere to put focus: it is what
      // `activeElement` falls back to when whatever opened the dialog was
      // itself unmounted on the way in — a menu item, say. Focusing it would
      // send the keyboard to the top of the document; leaving it alone keeps
      // the browser's own sequential position, which is where the dialog was.
      if (returnTo && returnTo !== document.body && returnTo.isConnected) returnTo.focus();
    };
  }, [latest]);
  return host;
}

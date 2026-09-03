// @vitest-environment jsdom
/**
 * The keyboard pass R-23 walked by hand and deferred the automation of to
 * here.
 *
 * That pass found six things by walking, none of them visible from reading the
 * code. Four of them are assertions here — Escape in the walkthrough, the cut
 * list's keyboard route, where find-by-name lands, and the focus ring's rule —
 * alongside the ones the *automated* pass found on top of them (see
 * `Controls.tsx`'s `FieldLabel`). Two are not: the 3D view's arrow keys move a
 * three.js camera and need a real GL context, so they are in
 * `apps/web/e2e/keyboard.spec.ts`; and the printed pack's brightness was
 * already pinned by `contrast.test.ts`, which reads both palettes out of the
 * stylesheet.
 *
 * `useDialog`'s focus trap and `useDismissable`'s Escape are here too. They
 * come from `overlays.ts`'s own list rather than that pass's, and they are the
 * two that most easily become assertions that cannot fail — see the note on
 * the trap below.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { defaultParams } from '@cabgen/core';
// The stylesheet as text, the way `contrast.test.ts` reads it: imported
// rather than read off disk, so it follows the file if it ever moves.
import STYLESHEET from '../src/styles.css?raw';
import { CommandPalette } from '../src/components/CommandPalette';
import { Inspector } from '../src/components/Inspector';
import { OutputPack } from '../src/components/OutputPack';
import { TopBar } from '../src/components/TopBar';
import { useStore } from '../src/store';
import { change, renderPanel, resetStore, settle } from './setup/app';

const press = (key: string, target: Document | Element = document): void => {
  fireEvent.keyDown(target, { key });
};

describe('overlays answer the key that opened them', () => {
  /**
   * The defect R-23 found and could not have found by reading: the
   * walkthrough's Escape listener was keyed on an `onClose` prop rebuilt every
   * render, and the *global* Escape handler's own store update re-rendered the
   * inspector during the same event's dispatch — so the listener was marked
   * removed before the event reached it, and its replacement was added too
   * late to be called. Escape did nothing, on the one dialog in the app you
   * most want to back out of, eleven tape readings deep.
   *
   * Rendering the inspector *and* the global shortcuts together is the whole
   * point: either alone, Escape works.
   */
  it('escape closes the measurement walkthrough, with the global handler live', async () => {
    renderPanel(
      <>
        <TopBar />
        <Inspector />
      </>,
    );
    await settle();
    // `useShortcuts` is what makes this a reproduction rather than a
    // formality: the bug lived in the interaction between the two listeners.
    await change(() => {
      const shortcuts = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(shortcuts);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Measure the room…' }));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Measure the opening' })).toBeTruthy();

    await change(() => press('Escape'));
    expect(screen.queryByRole('dialog', { name: 'Measure the opening' })).toBeNull();
  });

  /** A modal that leaks Tab is a way to change a parameter you cannot see. */
  it('a dialog holds Tab inside itself and gives focus back on the way out', async () => {
    renderPanel(
      <>
        <TopBar />
        <CommandPalette />
      </>,
    );
    await settle();

    const opener = screen.getByRole('button', { name: /Find/ });
    opener.focus();
    fireEvent.click(opener);
    await settle();

    const dialog = screen.getByRole('dialog', { name: 'Find a setting' });
    // A query, so the dialog has results in it: an empty palette is one text
    // field, and a trap with one stop cannot show that it wraps.
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'kickboard' } });
    const stops = [within(dialog).getByRole('textbox'), ...within(dialog).getAllByRole('button')];
    expect(stops.length).toBeGreaterThan(1);
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;

    // Identity, not containment. The first version of this asserted that
    // focus was still *inside* the dialog after Tab — which `last.focus()`
    // has already made true, so the assertion held with the whole Tab branch
    // of `useDialog` deleted. Review caught it by doing exactly that.
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement, 'Tab off the last stop did not wrap to the first').toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement, 'Shift+Tab off the first stop did not wrap to the last').toBe(
      last,
    );

    await change(() => useStore.getState().setPaletteOpen(false));
    expect(document.activeElement).toBe(opener);
  });

  /**
   * A popover opened with the keyboard has to be closable with it, and leave
   * the keyboard where the hand thinks it is. The ☰ menu is local state, so
   * the global Escape shortcut never sees it — `useDismissable` is the only
   * thing answering.
   */
  it('a popover closes on escape and leaves focus on its own button', async () => {
    renderPanel(<TopBar />);
    await settle();

    const menu = screen.getByRole('button', { name: 'Project menu' });
    menu.focus();
    fireEvent.click(menu);
    expect(screen.getByRole('button', { name: 'Start from a design…' })).toBeTruthy();

    await change(() => press('Escape'));
    expect(screen.queryByRole('button', { name: 'Start from a design…' })).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});

describe('every route through the app has a keyboard', () => {
  /**
   * The cut list's rows were `<tr onClick>`, which takes no focus and answers
   * no key — and it is the only route to a part's drawing, and the only route
   * to selecting a part at all outside the 3D view. Found by R-23's pass.
   */
  it('a part is selectable from the cut list without a pointer', async () => {
    resetStore(defaultParams());
    await change(() => useStore.getState().setSurface('output'));
    renderPanel(<OutputPack />);
    await settle();

    const id = useStore.getState().project.cutList[0]!.id;
    const row = screen.getByRole('button', { name: id });
    row.focus();
    expect(document.activeElement).toBe(row);

    await change(() => fireEvent.click(row));
    expect(useStore.getState().selection).toEqual({ kind: 'part', partId: id });
  });

  /**
   * Find-by-name focuses the first control inside what it found, and an
   * infotip's button belongs to the *label*, so it comes first in the DOM.
   * Searching "kickboard" used to put the keyboard on "What this does".
   * True since the infotips landed in R-22, found by R-23's pass.
   */
  it('find-by-name lands on the field, never on its info button', async () => {
    renderPanel(
      <>
        <Inspector />
        <CommandPalette />
      </>,
    );
    await settle();

    await change(() => useStore.getState().reveal({ surface: 'bench', param: 'opening.enabled' }));
    await settle();

    const focused = document.activeElement as HTMLElement;
    expect(focused.classList.contains('infotip-btn')).toBe(false);
    expect(focused.closest('[data-param]')?.getAttribute('data-param')).toBe('opening.enabled');
  });

  /**
   * The two things the automated pass found that the hand pass did not.
   *
   * Every `<label>` in `Controls.tsx` was detached from its control — no
   * `for`, and not wrapping it — so every input, select and checkbox in the
   * app was anonymous to assistive technology, which is the one thing a label
   * exists to prevent. And once the `for` was added, the info button sitting
   * inside the label became part of the name: "Width i".
   */
  it('every field names its own control, and the info button is not part of the name', async () => {
    const params = defaultParams();
    params.opening.enabled = true;
    resetStore(params);
    renderPanel(<Inspector />);
    await settle();

    const fields = [...document.querySelectorAll<HTMLElement>('.field')];
    expect(fields.length).toBeGreaterThan(3);
    let explained = 0;
    for (const field of fields) {
      const control = field.querySelector<HTMLElement>('input, select, textarea');
      if (!control) continue;
      const label = field.querySelector('label')!;
      const name = accessibleName(control);
      expect(name, `a control is announced as "${name}"`).not.toBe('');
      expect(name).toBe(label.querySelector('span')!.textContent);
      // Where there is an info button, the label's own text is longer than
      // the name — which is the assertion that it was left out of it.
      if (field.querySelector('.infotip-btn')) {
        explained += 1;
        expect(label.textContent!.length).toBeGreaterThan(name.length);
      }
      // And the label is wired to the control, not merely sitting beside it.
      // `aria-labelledby` alone would satisfy every assertion above while
      // leaving a click on the caption doing nothing, which is half of what
      // a label is for.
      expect(label.getAttribute('for'), `"${name}" has a label pointing nowhere`).toBe(control.id);
    }
    expect(explained).toBeGreaterThan(0);
  });

  /**
   * Clicking the caption reaches the control, which is the half of a label
   * that `aria-labelledby` cannot supply — and the half nothing else here
   * would notice going missing.
   */
  it('and clicking a field caption toggles its control', async () => {
    renderPanel(<Inspector />);
    await settle();

    const field = document.querySelector<HTMLElement>('[data-param="opening.enabled"]')!;
    const box = field.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(false);

    await change(() => fireEvent.click(field.querySelector('label span')!));
    expect(useStore.getState().params.opening.enabled).toBe(true);
  });
});

/**
 * The focus ring, read out of the stylesheet.
 *
 * `input:focus { outline: none }` left a keyboard user with no way to tell
 * which of sixty fields had focus — R-23 found it by looking. It is the one
 * accessibility rule that is a single declaration away from coming back, and
 * it cannot be seen from a rendered DOM, so it is checked in the file itself
 * the way `contrast.test.ts` checks the palette.
 */
describe('focus stays visible', () => {
  const css = STYLESHEET;

  it('nothing removes an outline without putting one back', () => {
    // `all: unset` counts: it drops the app-wide ring along with everything
    // else, which is exactly how `.infotip-btn` lost its and had to say so.
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const removed = blocks.filter(([, selector, body]) => {
      if (!/:focus(-visible)?\b/.test(selector!)) return false;
      return /outline:\s*(none|0)\b/.test(body!);
    });
    expect(removed.map(([, s]) => s!.trim())).toEqual([]);
  });

  it('and a visible ring is defined for the focus-visible state', () => {
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline:\s*\d+px/);
  });
});

/**
 * The accessible name a browser would compute for a form control, in the two
 * ways this app produces one: `aria-labelledby`, and an associated `<label>`.
 * jsdom computes neither, and the whole point of the assertion above is that
 * the app stopped relying on proximity.
 */
function accessibleName(control: HTMLElement): string {
  const by = control.getAttribute('aria-labelledby');
  if (by) return document.getElementById(by)?.textContent?.trim() ?? '';
  const label = control.getAttribute('aria-label');
  if (label) return label.trim();
  const id = control.id;
  if (id) {
    // Matched by walking rather than by a selector: `useId` puts colons in an
    // id, jsdom has no `CSS.escape` to quote them with, and the version of
    // this that used one threw a TypeError instead of asserting anything.
    const forLabel = [...document.querySelectorAll('label')].find((l) => l.htmlFor === id);
    if (forLabel) return forLabel.textContent?.trim() ?? '';
  }
  return control.closest('label')?.textContent?.trim() ?? '';
}

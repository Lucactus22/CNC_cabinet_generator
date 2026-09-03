import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../src/components/CommandPalette';
import { DiagnosticsPanel } from '../src/components/DiagnosticsPanel';
import { Inspector } from '../src/components/Inspector';
import { StarterGallery } from '../src/gallery/StarterGallery';
import { WorkshopDrawer } from '../src/components/WorkshopDrawer';
import { defaultParams, type ProjectParams } from '@cabgen/core';
import { useStore } from '../src/store';
import { resetStore, settled } from './setup/harness';

/**
 * The things that open over the bench, and the keyboard that works them.
 *
 * R-23 landed `overlays.ts` after finding that Escape did nothing in the one
 * dialog you most want to back out of, and deferred the automated pass to
 * R-24 because there was no harness to assert it in. This is that pass for
 * everything a DOM can answer: what opens, what closes it, and where the
 * keyboard is left afterwards. Tab order under real layout is walked
 * end-to-end instead — jsdom gives every element an empty client rect, so a
 * focus trap that filters on visibility cannot be measured here.
 */

/** The same shop with the sheet measured differently — one number, every groove. */
function measuredAt(thickness: number): ProjectParams {
  const params = defaultParams();
  params.materials[0]!.actualThickness = thickness;
  return params;
}

beforeEach(() => resetStore());

describe('the diagnostics list', () => {
  it('offers a fix and applies it, and the blocking count really falls', async () => {
    act(() => useStore.setState({ diagnosticsOpen: true }));
    render(<DiagnosticsPanel />);

    const blocking = (): number =>
      useStore.getState().project.diagnostics.filter((d) => d.severity === 'error').length;
    expect(blocking()).toBeGreaterThan(0);

    // R-16's worst finding was that the app's own suggested fix traded two
    // errors for a different blocking error. Every candidate is now built
    // before it is offered; this is that promise, kept through the button.
    const fix = screen.getAllByRole('button', { name: /Clears everything blocking export/ })[0]!;
    await userEvent.click(fix);
    await settled();
    expect(blocking()).toBe(0);
  });

  it('collapses a family of repeats behind one line, and opens exactly that many', async () => {
    act(() => useStore.setState({ diagnosticsOpen: true }));
    render(<DiagnosticsPanel />);

    // Four near-identical tiling warnings and four near-identical tile-span
    // notes, out of fourteen entries, was F-8 — a quarter of the window spent
    // saying the same thing eight times.
    const more = screen.getAllByRole('button', { name: /more like it/ })[0]!;
    const hidden = Number(/and (\d+) more/.exec(more.textContent ?? '')![1]);
    const group = more.closest('li') as HTMLElement;
    expect(group.querySelectorAll('.msg')).toHaveLength(1);

    await userEvent.click(more);
    // The line promised a number; opening it has to produce that number, not
    // merely more text than before.
    expect(group.querySelectorAll('.msg')).toHaveLength(hidden + 1);
    expect(within(group).getByRole('button', { name: 'show fewer' })).toBeTruthy();
  });

  it('closes on its own dismiss button', async () => {
    act(() => useStore.setState({ diagnosticsOpen: true }));
    render(<DiagnosticsPanel />);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    expect(useStore.getState().diagnosticsOpen).toBe(false);
  });
});

describe('find by name', () => {
  it('is not in the page until it is opened', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog', { name: 'Find a setting' })).toBeNull();
  });

  it('takes the keyboard when it opens, so typing starts straight away', async () => {
    act(() => useStore.setState({ paletteOpen: true }));
    render(<CommandPalette />);
    await waitFor(() => {
      expect(document.activeElement?.tagName).toBe('INPUT');
    });
  });

  it("finds a control by the trade's word for it, not the app's", async () => {
    act(() => useStore.setState({ paletteOpen: true }));
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('textbox'), 'kickboard');
    expect(screen.getByText('Toe kick')).toBeTruthy();
  });

  it('says so plainly when there is nothing by that name', async () => {
    act(() => useStore.setState({ paletteOpen: true }));
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('textbox'), 'flux capacitor');
    expect(screen.getByText(/Nothing by that name/)).toBeTruthy();
  });

  /**
   * Enter used to fall through to whatever `reveal` had just focused. Where
   * that was a gallery, the first option got picked: searching "knock-down"
   * quietly set the carcass joint. A search that changes the design is the
   * class of failure this codebase exists not to have.
   */
  it('goes to the found control on Enter without choosing anything', async () => {
    act(() => useStore.setState({ paletteOpen: true }));
    render(
      <>
        <CommandPalette />
        <Inspector />
      </>,
    );
    const before = JSON.stringify(useStore.getState().params);
    const palette = screen.getByRole('dialog', { name: 'Find a setting' });
    await userEvent.type(within(palette).getByRole('textbox'), 'knock-down{Enter}');

    expect(useStore.getState().paletteOpen).toBe(false);
    expect(useStore.getState().focusParam).toBe('joinery.carcassJoint');
    expect(JSON.stringify(useStore.getState().params)).toBe(before);
  });

  it('closes on Escape', async () => {
    act(() => useStore.setState({ paletteOpen: true }));
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('textbox'), '{Escape}');
    expect(useStore.getState().paletteOpen).toBe(false);
  });
});

describe('a modal over the bench', () => {
  it('names itself, and holds Tab inside it', async () => {
    act(() => useStore.setState({ startersOpen: true }));
    render(<StarterGallery />);
    const dialog = screen.getByRole('dialog', { name: 'Start from a design' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await userEvent.tab();
    // The page underneath is sixty controls the dialog is covering; Tab
    // reaching them is both a screen-reader trap and a way to change a
    // parameter you cannot see.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('puts the keyboard back where it came from on the way out', async () => {
    render(
      <>
        <button type="button" onClick={() => useStore.getState().setStartersOpen(true)}>
          Start from a design…
        </button>
        <Opener />
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Start from a design…' });
    await userEvent.click(opener);
    await waitFor(() => screen.getByRole('dialog', { name: 'Start from a design' }));

    act(() => useStore.getState().setStartersOpen(false));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

/** Mounts the gallery only while it is open, the way the shell does. */
function Opener() {
  const open = useStore((s) => s.startersOpen);
  return open ? <StarterGallery /> : null;
}

describe('a starter design', () => {
  it('loads complete, on this shop rather than the one it was written on', async () => {
    act(() => useStore.setState({ startersOpen: true }));
    render(<StarterGallery />);

    // The workshop half of the live project has to survive picking a design:
    // choosing different furniture is not a reason to re-cut it to somebody
    // else's sheet thickness.
    act(() => {
      useStore.getState().update((p) => {
        p.materials[0]!.actualThickness = 17.6;
      });
    });
    await settled();

    await userEvent.click(screen.getByRole('button', { name: /A bookcase/ }));
    await settled();

    const state = useStore.getState();
    expect(state.params.name).toBe('Bookcase');
    expect(state.params.materials[0]!.actualThickness).toBe(17.6);
    expect(state.startersOpen).toBe(false);
    expect(state.project.parts.length).toBeGreaterThan(0);
  });
});

describe('the workshop drawer', () => {
  it('holds the shop, and leaves the furniture to the inspector', async () => {
    act(() => useStore.setState({ workshopOpen: true }));
    render(<WorkshopDrawer />);
    expect(screen.getByText('Machine')).toBeTruthy();
    // The carcass's own dimensions belong to the selection, not in here.
    expect(screen.queryByLabelText('Depth')).toBeNull();
  });

  /**
   * A profile is a value copied in, never a pointer the project follows. A
   * design that silently re-cut itself to whoever opened it would be the
   * "silently producing a wrong cabinet" failure, in the one setting that
   * decides every groove width in the project.
   */
  it('copies a saved shop into the project, loudly and undoably', async () => {
    // Two projects, opened rather than typed: consecutive edits inside the
    // 500 ms window collapse into one undo step by design, and this test is
    // about the step applying a profile makes on its own.
    await resetStore(measuredAt(17.4));
    act(() => {
      useStore.setState({ workshopOpen: true });
      useStore.getState().saveWorkshop('Bench');
      useStore.getState().load(measuredAt(18));
    });
    await settled();
    render(<WorkshopDrawer />);

    await userEvent.click(screen.getByRole('button', { name: /Bench/ }));
    await settled();

    expect(useStore.getState().params.materials[0]!.actualThickness).toBe(17.4);
    expect(useStore.getState().workshopNotes[0]).toContain('Bench');
    // …and says so on the drawer, not only in the state.
    expect(screen.getByText(/Applied the "Bench" workshop/)).toBeTruthy();

    act(() => useStore.getState().undo());
    await settled();
    expect(useStore.getState().params.materials[0]!.actualThickness).toBe(18);
  });
});

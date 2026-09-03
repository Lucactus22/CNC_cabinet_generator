import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultParams } from '@cabgen/core';
import { TopBar, useShortcuts } from '../src/components/TopBar';
import { useStore } from '../src/store';
import { exportableParams, resetStore, settled } from './setup/harness';
import { failBuilds, holdBuilds, releaseBuilds, stopFailingBuilds } from './setup/dom';

/**
 * The one row that is always there, and the gate in front of the machine.
 *
 * R-14 named the app's missing tests back in Milestone E and R-24 finally
 * builds them, against the shell R-17 actually shipped. What is pinned here
 * is not that the bar renders — it is the two answers that decide whether
 * somebody cuts plywood: whether export is allowed, and what it does when it
 * is not.
 */

const startingWidth = defaultParams().cabinets[0]!.carcasses[0]!.width;

const disabled = (button: HTMLElement): boolean => (button as HTMLButtonElement).disabled;

beforeEach(() => resetStore());

describe('the readiness chip', () => {
  it('says what stands between this and the machine, not that it is fine', async () => {
    render(<TopBar />);
    // The default project is the fixture docs/UX.md measured: on a 1 m
    // machine, its 2440 mm sheets are wider than the axis that never moves,
    // which is a blocking error before anybody has touched anything.
    const chip = screen.getByRole('button', { name: /blocking/ });
    expect(chip.className).toContain('error');
    await userEvent.click(chip);
    expect(useStore.getState().diagnosticsOpen).toBe(true);
  });

  it('stops blocking once the sheets fit the machine', async () => {
    await resetStore(exportableParams());
    render(<TopBar />);
    // Still things to check — a fresh project has warnings the fix does not
    // touch — but nothing that stands between it and the machine.
    const chip = screen.getByRole('button', { name: /to check/ });
    expect(chip.className).toContain('warning');
    expect(chip.className).not.toContain('error');
  });
});

describe('the export button', () => {
  it('refuses a project with a blocking error, and opens the list that says why', async () => {
    render(<TopBar />);
    const button = screen.getByRole('button', { name: 'Export DXF' });
    // Painted as blocked, so the state the test below asserts the *absence*
    // of is one this file has seen present. Deliberately not a `disabled`
    // button: a disabled control cannot explain itself, and this is the first
    // screen every new project lands on.
    expect(button.className).toContain('blocked');
    await userEvent.click(button);
    expect(useStore.getState().exportPreviewOpen).toBe(false);
    expect(useStore.getState().diagnosticsOpen).toBe(true);
  });

  it('offers the preview once nothing is blocking', async () => {
    await resetStore(exportableParams());
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(true);
  });

  /**
   * The expensive one. `project` lags `params` while the worker catches up, so
   * exporting mid-build would write the *previous* parameters' geometry —
   * every dimension off by whatever the last edit changed, with no error to
   * show for it. That is this codebase's worst failure, in a zip file.
   */
  it('does nothing at all while a build is still in flight', async () => {
    await resetStore(exportableParams());
    render(<TopBar />);
    holdBuilds();
    act(() => {
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses[0]!.width = 900;
      });
    });
    expect(useStore.getState().building).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(false);
    // …and not by pretending it is an error either: a rebuild in flight
    // painted the same red as an unmachinable part would say the design is
    // wrong when it is merely a keystroke ahead of the preview.
    expect(screen.getByRole('button', { name: 'Export DXF' }).className).not.toContain('blocked');

    act(() => releaseBuilds());
    await settled();
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(true);
  });
});

/**
 * The pipeline is pure and is not meant to throw. If it ever does, the answer
 * cannot be silence: before this, a throw posted no reply at all, so the
 * client believed a build was still running for the rest of the session — the
 * badge stuck on *updating…*, export refused with "wait a moment and try
 * again", and nothing anywhere saying what had happened.
 *
 * The dangerous half is the opposite one. Clearing the flag without blocking
 * export would leave the *previous* parameters' geometry exportable with
 * nothing to say so, which is the silently-wrong-cabinet failure in a zip.
 */
describe('when a build cannot be finished', () => {
  it('says so, and will not export the older project still on screen', async () => {
    await resetStore(exportableParams());
    render(<TopBar />);
    // Exportable before, so what changes below is the failure and not the design.
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(true);
    act(() => useStore.setState({ exportPreviewOpen: false }));

    failBuilds('the divider fell over');
    act(() => {
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses[0]!.width = 850;
      });
    });
    await settled();

    expect(useStore.getState().buildError).toContain('the divider fell over');
    expect(screen.getByRole('button', { name: /cannot build/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(false);

    // …and it clears itself the moment a build succeeds again, rather than
    // needing the page reloaded.
    stopFailingBuilds();
    act(() => {
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses[0]!.width = 820;
      });
    });
    await settled();
    expect(useStore.getState().buildError).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Export DXF' }));
    expect(useStore.getState().exportPreviewOpen).toBe(true);
  });
});

describe('undo', () => {
  it('is offered only once there is something to undo, and puts the number back', async () => {
    render(<TopBar />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(disabled(undo)).toBe(true);

    act(() => {
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses[0]!.width = 900;
      });
    });
    await settled();
    expect(disabled(undo)).toBe(false);

    await userEvent.click(undo);
    await settled();
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(startingWidth);
  });

  /**
   * A drag on a numeric field fires an update per pixel. One undo step per
   * pixel would make Ctrl+Z useless exactly where it is needed most, so a
   * burst collapses — and the button has to agree with the shortcut about
   * how many steps there are, or they disagree in front of the user.
   */
  it('collapses a burst of edits into one step', async () => {
    render(<TopBar />);
    for (const width of [820, 840, 860, 880]) {
      act(() => {
        useStore.getState().update((p) => {
          p.cabinets[0]!.carcasses[0]!.width = width;
        });
      });
    }
    await settled();
    expect(useStore.getState().past.length).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await settled();
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(startingWidth);
    expect(disabled(screen.getByRole('button', { name: 'Redo' }))).toBe(false);
  });
});

/** The shortcuts hook has no markup of its own; this is somewhere to run it. */
function Shortcuts() {
  useShortcuts();
  return <TopBar />;
}

describe('the keyboard', () => {
  it('opens find-by-name on Ctrl+K', async () => {
    render(<Shortcuts />);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(useStore.getState().paletteOpen).toBe(true);
  });

  it('undoes and redoes on Ctrl+Z, and leaves a field being typed in alone', async () => {
    render(<Shortcuts />);
    act(() => {
      useStore.getState().update((p) => {
        p.name = 'Boot room';
      });
    });
    await settled();

    await userEvent.keyboard('{Control>}z{/Control}');
    await settled();
    expect(useStore.getState().params.name).toBe(defaultParams().name);

    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await settled();
    expect(useStore.getState().params.name).toBe('Boot room');
  });

  it('backs out to the run on Escape, closing whatever is over the bench', async () => {
    act(() => {
      useStore.setState({ diagnosticsOpen: true, workshopOpen: true });
      useStore.getState().select({ kind: 'cabinet', cabinetId: 'C1' });
    });
    render(<Shortcuts />);
    await userEvent.keyboard('{Escape}');
    const state = useStore.getState();
    expect(state.diagnosticsOpen).toBe(false);
    expect(state.workshopOpen).toBe(false);
    expect(state.selection.kind).toBe('run');
  });
});

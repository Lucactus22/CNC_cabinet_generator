import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultParams } from '@cabgen/core';
import { Inspector } from '../src/components/Inspector';
import { useStore } from '../src/store';
import { resetStore, settled } from './setup/harness';

/**
 * What applies to what is selected, and nothing else.
 *
 * R-16 measured the old sidebar answering a click on a panel with fourteen
 * changed characters 5224 px down a column (F-4). R-17's answer rests on two
 * promises that only a rendered inspector can be held to: that the panel
 * always shows the selected thing's own controls, and that a selection whose
 * subject stops existing settles somewhere real rather than leaving the
 * inspector pointed at an id nothing answers to.
 */

const BASE = { kind: 'carcass', cabinetId: 'C1', carcassId: 'B' } as const;
const SECOND_BAY = { kind: 'bay', cabinetId: 'C1', carcassId: 'B', bay: 1 } as const;

/** The trail at the top of the card, which names the path to the selection. */
const crumbs = (): string =>
  screen.getByLabelText('Inspector').querySelector('.crumbs')!.textContent ?? '';

/** The controls themselves, so a heading is never confused with a breadcrumb. */
const controls = (): HTMLElement =>
  screen.getByLabelText('Inspector').querySelector<HTMLElement>('.inspector-body')!;

const startingWidth = defaultParams().cabinets[0]!.carcasses[0]!.width;

beforeEach(() => resetStore());

describe('selection always resolves', () => {
  it('shows the project itself when nothing narrower is selected', () => {
    render(<Inspector />);
    // There is no empty state to design, because "nothing selected" is the
    // run, and the run has plenty to show.
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByText('The room')).toBeTruthy();
  });

  it('narrows to the thing that was selected', async () => {
    act(() => useStore.getState().select(SECOND_BAY));
    render(<Inspector />);
    expect(within(controls()).getByText('Bay 2')).toBeTruthy();
    // …and stops showing the run's own controls while it does.
    expect(screen.queryByText('The room')).toBeNull();
  });

  /**
   * The failure this exists to prevent: drop the divider and bay 2 is gone,
   * but the selection still names it. An inspector that kept rendering it
   * would be offering controls for an opening that is no longer built — and
   * writing to it would write to a bay index the builder never reads.
   */
  it('settles back up when the selected thing stops existing', async () => {
    act(() => useStore.getState().select(SECOND_BAY));
    render(<Inspector />);
    expect(within(controls()).getByText('Bay 2')).toBeTruthy();

    act(() => {
      useStore.getState().update((p) => {
        const carcass = p.cabinets[0]!.carcasses[0]!;
        carcass.dividerCount = 0;
        carcass.bays = carcass.bays.slice(0, 1);
      });
    });
    await settled();

    expect(useStore.getState().selection.kind).toBe('carcass');
    expect(within(controls()).queryByText('Bay 2')).toBeNull();
    expect(within(controls()).getByText('Size')).toBeTruthy();
  });

  it('settles a selected part away when the part is no longer cut', async () => {
    act(() => useStore.getState().select({ kind: 'part', partId: 'C1-B-DIV-1' }));
    render(<Inspector />);
    expect(useStore.getState().selection.kind).toBe('part');

    act(() => {
      useStore.getState().update((p) => {
        const carcass = p.cabinets[0]!.carcasses[0]!;
        carcass.dividerCount = 0;
        carcass.bays = carcass.bays.slice(0, 1);
      });
    });
    await settled();

    expect(useStore.getState().selection.kind).not.toBe('part');
  });
});

describe('the breadcrumb', () => {
  it('names the path down to the selection, and walks back up it', async () => {
    act(() => useStore.getState().select(SECOND_BAY));
    render(<Inspector />);
    expect(crumbs()).toContain('Run');
    expect(crumbs()).toContain('Stacked unit');
    expect(crumbs()).toContain('Base');

    await userEvent.click(screen.getByRole('button', { name: 'Base' }));
    expect(useStore.getState().selection).toEqual(BASE);
  });

  it('offers a way back to the run, and nothing to dismiss when already there', async () => {
    act(() => useStore.getState().select(SECOND_BAY));
    const view = render(<Inspector />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the run' }));
    expect(useStore.getState().selection.kind).toBe('run');

    view.rerender(<Inspector />);
    expect(screen.queryByRole('button', { name: 'Back to the run' })).toBeNull();
  });
});

describe('a control in the inspector', () => {
  it('writes through to the design, and the change is undoable', async () => {
    act(() => useStore.getState().select(BASE));
    render(<Inspector />);

    // One change event, the way a browser reports typing over a selection.
    // Clearing the field first would not: an empty numeric field reads as
    // zero and the control clamps it up to its own minimum, so the digits
    // would land after that rather than replacing it.
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '820' } });
    await settled();
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(820);

    act(() => useStore.getState().undo());
    await settled();
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(startingWidth);
  });

  /**
   * An arrow key steps a numeric field by its own `step`, and the fit
   * clearance is the one field in the inspector where the default step of 1
   * would be a ruined joint: it is the tolerance a test cut is tuned by, in
   * twentieths of a millimetre. Nudging it a whole millimetre would open
   * every groove in the project by more than a sheet's thickness tolerance.
   *
   * The key itself is driven in a real browser by the end-to-end walk; jsdom
   * does not implement the browser's own stepping.
   */
  it('nudges the fit clearance in twentieths, not in millimetres', async () => {
    act(() => useStore.getState().select(BASE));
    render(<Inspector />);
    const joinery = within(controls())
      .getByText('How it goes together')
      .closest('details') as HTMLElement;
    await userEvent.click(within(joinery).getByText('How it goes together'));
    expect(within(joinery).getByLabelText('Fit clearance')).toHaveProperty('step', '0.05');
  });
});

describe('a bay', () => {
  it('offers drawers, and turning them on builds a drawer box', async () => {
    act(() => useStore.getState().select(SECOND_BAY));
    render(<Inspector />);

    const drawerParts = (): number =>
      useStore.getState().project.parts.filter((p) => p.id.includes('-DRAWER-')).length;
    expect(drawerParts()).toBe(0);

    const bay = within(controls()).getByText('Bay 2').closest('details') as HTMLElement;
    await userEvent.click(within(bay).getByRole('button', { name: /Drawers/ }));
    await settled();

    // A box, not just a front: five panels per drawer, and the whole point of
    // the choice is that they get cut.
    expect(drawerParts()).toBeGreaterThan(0);
  });
});

// @vitest-environment jsdom
/**
 * The inspector, which is the whole of R-17's argument.
 *
 * The old sidebar answered a click on a panel with **fourteen characters**
 * 5224 px down a column (docs/UX.md, J4). Everything here exists to stop that
 * coming back: what is selected decides what is on screen, a control writes
 * the parameter its catalogue entry claims and no other, and a selection that
 * stops existing narrows rather than leaving the card pointed at nothing.
 *
 * These are component tests rather than end-to-end ones because the failures
 * they catch are not visual. A field wired to the wrong path still looks
 * right — it just cuts the wrong cabinet.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { defaultParams, type ProjectParams } from '@cabgen/core';
import { Inspector } from '../src/components/Inspector';
import { WorkshopDrawer } from '../src/components/WorkshopDrawer';
import { useStore } from '../src/store';
import { change, changedPaths, renderPanel, resetStore, settle } from './setup/app';

/** The default project's first cabinet, first carcass. */
const at = (params: ProjectParams = useStore.getState().params) => {
  const cabinet = params.cabinets[0]!;
  return { cabinetId: cabinet.id, carcassId: cabinet.carcasses[0]!.id };
};

const select = (selection: Parameters<ReturnType<typeof useStore.getState>['select']>[0]) =>
  change(() => useStore.getState().select(selection));

const bodyText = (): string =>
  screen.getByRole('complementary', { name: 'Inspector' }).textContent ?? '';

describe('the inspector answers the selection', () => {
  it('gives every level of the model its own controls', async () => {
    renderPanel(<Inspector />);
    await settle();

    // The run: the resting state, and the only one that must never be empty.
    expect(bodyText()).toContain('Project');
    expect(bodyText()).toContain('The room');

    const { cabinetId, carcassId } = at();
    await select({ kind: 'cabinet', cabinetId });
    expect(bodyText()).toContain('The stack');

    await select({ kind: 'carcass', cabinetId, carcassId });
    expect(screen.getByLabelText('Width')).toBeTruthy();
    expect(screen.getByLabelText('Depth')).toBeTruthy();

    await select({ kind: 'bay', cabinetId, carcassId, bay: 0 });
    expect(bodyText()).toContain('Bay 1');

    const part = useStore.getState().project.parts[0]!;
    await select({ kind: 'part', partId: part.id });
    expect(bodyText()).toContain('This panel');
  });

  /**
   * A bay's controls that answered for a different bay would edit the wrong
   * opening, and the model gives no clue which one — bays are numbered, not
   * named. This is the "drawers in *that* bay" journey's safety net.
   */
  it('shows the selected bay and no other', async () => {
    const params = defaultParams();
    params.cabinets[0]!.carcasses[0]!.dividerCount = 2;
    resetStore(params);
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    await select({ kind: 'bay', cabinetId, carcassId, bay: 1 });

    expect(bodyText()).toContain('Bay 2');
    expect(bodyText()).not.toContain('Bay 1');
    expect(bodyText()).not.toContain('Bay 3');
  });

  /**
   * `settleSelection` narrowing up the hierarchy is what keeps the card from
   * describing a panel that is no longer cut. Removing a carcass is the
   * ordinary way to reach that state — it is step one of J1.
   */
  it('narrows to the cabinet when the selected carcass is removed', async () => {
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    await select({ kind: 'carcass', cabinetId, carcassId });
    expect(screen.getByLabelText('Width')).toBeTruthy();

    await change(() =>
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses.splice(0, 1);
      }),
    );

    expect(useStore.getState().selection.kind).toBe('cabinet');
    expect(bodyText()).toContain('The stack');
  });

  /**
   * Selection always resolves, so there is no empty state to design — and no
   * state where the shell has nothing to say. A blank card is the failure this
   * rules out.
   */
  it('never renders an empty card, whatever it is pointed at', async () => {
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    const selections = [
      { kind: 'run' } as const,
      { kind: 'cabinet', cabinetId } as const,
      { kind: 'carcass', cabinetId, carcassId } as const,
      { kind: 'bay', cabinetId, carcassId, bay: 0 } as const,
      // Names nothing that exists: settles back to the run rather than blank.
      { kind: 'part', partId: 'C9-B-NOTHING' } as const,
    ];
    for (const selection of selections) {
      await select(selection);
      const body = document.querySelector('.inspector-body')!;
      expect(within(body as HTMLElement).getAllByRole('group').length).toBeGreaterThan(0);
    }
  });
});

describe('a control writes the parameter it claims', () => {
  /**
   * The runtime half of `catalog.test.ts`'s promise. That test proves every
   * parameter is *claimed* by a control, statically, by reading the source;
   * nothing until now proved a control claiming `carcasses[].width` writes
   * the width rather than the depth. A field wired to the neighbouring path
   * looks identical on screen and cuts a different cabinet.
   *
   * Every numeric field the inspector renders for a selection is nudged, and
   * the parameters diffed: exactly the path on the field's own wrapper may
   * move. Some fields legitimately move more than one leaf — a bay count
   * grows the bay list — so the assertion is that the claimed path is among
   * what moved and that nothing outside its own object did.
   */
  const sweep = async (): Promise<string[]> => {
    const swept: string[] = [];
    const fields = [...document.querySelectorAll<HTMLElement>('[data-param]')].flatMap((host) => {
      const input = host.querySelector<HTMLInputElement>('input[type="number"]');
      return input ? [{ param: host.dataset.param!, input }] : [];
    });

    for (const { param, input } of fields) {
      const before = structuredClone(useStore.getState().params);
      const next = Number(input.value) + 1;
      await change(() => fireEvent.change(input, { target: { value: String(next) } }));
      const moved = changedPaths(before, useStore.getState().params);

      expect(moved, `${param} changed nothing`).not.toHaveLength(0);
      // At, or under, the path it claims: a field for one drawer's height
      // claims the list — `bays[].drawerFrontHeights` — and writes an element
      // of it, which is the same control, not a different parameter.
      const own = (path: string): boolean =>
        path === param || path.startsWith(`${param}[`) || path.startsWith(`${param}.`);
      expect(moved.some(own), `${param} wrote ${moved.join(', ')} rather than its own path`).toBe(
        true,
      );
      // Nothing outside the object the claimed path sits in. A bay count
      // adds bays; a width does not touch the hardware catalogue. A path
      // with no dot in it owns only itself — taking the empty string as its
      // scope would have made this check pass for anything.
      const dot = param.lastIndexOf('.');
      const scope = dot === -1 ? param : param.slice(0, dot + 1);
      for (const path of moved) {
        expect(path.startsWith(scope), `${param} also wrote ${path}`).toBe(true);
      }
      swept.push(param);
    }
    return swept;
  };

  it('across every numeric field the inspector renders', async () => {
    // Branches on, because a field only renders when its own switch is:
    // review pointed out that the first version of this swept 14 fields on
    // the shipped default and reported it as "every numeric field", missing
    // every drawer, face-frame, hanging-rail and opening number in the app.
    const params = defaultParams();
    const carcass = params.cabinets[0]!.carcasses[0]!;
    carcass.dividerCount = 1;
    carcass.construction = 'face-frame';
    carcass.hangingRail = { ...carcass.hangingRail, enabled: true };
    carcass.bays[0]!.shelves = 'adjustable';
    carcass.bays[1]!.drawerFrontHeights = [200, 200, 200];
    params.opening.enabled = true;
    resetStore(params);
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    const swept: string[] = [];
    for (const selection of [
      { kind: 'run' } as const,
      { kind: 'cabinet', cabinetId } as const,
      { kind: 'carcass', cabinetId, carcassId } as const,
      { kind: 'bay', cabinetId, carcassId, bay: 0 } as const,
      { kind: 'bay', cabinetId, carcassId, bay: 1 } as const,
    ]) {
      await select(selection);
      swept.push(...(await sweep()));
    }
    // A floor, so the sweep cannot quietly pass by finding nothing to sweep,
    // and distinct so a repeated field cannot make up the number.
    // A floor, so the sweep cannot quietly pass by finding nothing to sweep,
    // and distinct so a repeated field cannot make up the number. Thirty are
    // swept today; the floor is under it so merging two fields is a refactor
    // rather than a failure, and losing a whole section is a failure.
    expect(new Set(swept).size, `swept: ${[...new Set(swept)].sort().join(', ')}`).toBeGreaterThan(
      25,
    );
  });

  /**
   * The other panel R-24 was asked to test, and the one where a miswiring is
   * hardest to notice: nothing in a workshop number changes the picture on
   * screen, so a tool diameter written into the kerf would look exactly right
   * until the sheet came off the machine.
   */
  it('and across the workshop drawer', async () => {
    renderPanel(<WorkshopDrawer />);
    await settle();
    for (const details of document.querySelectorAll('details')) details.open = true;

    // Nineteen today: the machine's travel and tiling, the tool, the sheet
    // and board sizes, the tape and the nesting margins.
    const swept = await sweep();
    expect(new Set(swept).size, `swept: ${[...new Set(swept)].sort().join(', ')}`).toBeGreaterThan(
      15,
    );
  });

  /** Every change through the inspector is one undo step, as R-20 requires. */
  it('and the change is undoable', async () => {
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    await select({ kind: 'carcass', cabinetId, carcassId });
    const before = useStore.getState().params.cabinets[0]!.carcasses[0]!.width;

    await change(() =>
      fireEvent.change(screen.getByLabelText('Width'), { target: { value: '1234' } }),
    );
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(1234);

    await change(() => useStore.getState().undo());
    expect(useStore.getState().params.cabinets[0]!.carcasses[0]!.width).toBe(before);
  });
});

/**
 * R-22's promise, which a tablet at the machine depends on: a field explained
 * only by a hover tooltip is a field with no explanation at all on a device
 * with nothing to hover. Checked over every selection the inspector answers,
 * because the three field components funnel through one `title` prop and a
 * fourth written by hand would slip past.
 */
describe('no explanation is reachable only by hovering', () => {
  it('every explained field offers the same sentence to a click', async () => {
    renderPanel(<Inspector />);
    await settle();

    const { cabinetId, carcassId } = at();
    let checked = 0;
    for (const selection of [
      { kind: 'run' } as const,
      { kind: 'cabinet', cabinetId } as const,
      { kind: 'carcass', cabinetId, carcassId } as const,
      { kind: 'bay', cabinetId, carcassId, bay: 0 } as const,
    ]) {
      await select(selection);
      for (const field of document.querySelectorAll<HTMLElement>('.field[title]')) {
        checked += 1;
        const button = field.querySelector<HTMLButtonElement>('button.infotip-btn');
        expect(button, `"${field.textContent}" explains itself only on hover`).toBeTruthy();
        fireEvent.click(button!);
        expect(within(field).getByRole('tooltip').textContent).toBe(field.title);
        fireEvent.click(button!);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });
});

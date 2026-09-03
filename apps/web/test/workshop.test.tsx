// @vitest-environment jsdom
/**
 * The workshop drawer: the other half of R-17's split.
 *
 * "What you change every minute and what you set once a year do not belong in
 * the same place" is a principle a component can break silently — one control
 * about a particular cabinet drifting in here, and the drawer stops being the
 * shop. R-20 audited that by hand; this asserts it.
 *
 * The other thing worth pinning is the one CLAUDE.md calls the worst outcome
 * available: a project that re-cuts itself to whoever opened it. A profile is
 * a value applied as an undoable update that reports what it repointed, never
 * a live reference, and every part of that sentence is checked below.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { defaultParams } from '@cabgen/core';
import { WorkshopDrawer } from '../src/components/WorkshopDrawer';
import { TopBar } from '../src/components/TopBar';
import { isWorkshopTopic } from '../src/diagnosticTopics';
import { useStore } from '../src/store';
import { workshopOf } from '../src/workshop';
import { change, renderPanel, resetStore, settle } from './setup/app';

const openEveryGroup = (): void => {
  for (const details of document.querySelectorAll('details')) details.open = true;
};

describe('the workshop holds the shop, not the cabinet', () => {
  /**
   * R-20's last criterion, automated. A control about one cabinet in here is
   * a setting you cannot see the consequence of, in a drawer you opened to
   * change the machine — and it is the shape the old sidebar had.
   */
  it('no control in it writes anything under a cabinet', async () => {
    renderPanel(<WorkshopDrawer />);
    await settle();
    openEveryGroup();

    const claimed = [...document.querySelectorAll<HTMLElement>('[data-param]')].map(
      (host) => host.dataset.param!,
    );
    expect(claimed.length).toBeGreaterThan(20);
    for (const param of claimed) {
      expect(param.startsWith('cabinets'), `${param} is about one cabinet`).toBe(false);
      expect(param.startsWith('opening'), `${param} is about the room`).toBe(false);
    }
  });
});

describe('a workshop profile is a value, never a pointer', () => {
  it('applies as one undoable update and says what it repointed', async () => {
    // A shop whose sheets this project has never heard of: the doors, the
    // back and the scribe strips all point at ids the profile cannot supply,
    // and repointing them silently is the failure this reporting exists for.
    const other = defaultParams();
    other.materials = [
      {
        ...other.materials[0]!,
        id: 'other-shop-18',
        name: '18 mm shop ply',
        actualThickness: 18.2,
      },
    ];
    other.carcassMaterialId = 'other-shop-18';
    other.shelfMaterialId = 'other-shop-18';
    other.drawerBoxMaterialId = 'other-shop-18';
    other.machine = { ...other.machine, travelX: 3000, travelY: 2000 };

    renderPanel(<WorkshopDrawer />);
    await settle();

    await change(() =>
      useStore.setState({
        profiles: [
          {
            id: 'p1',
            name: 'The other shop',
            savedAt: '2026-01-01T00:00:00Z',
            settings: workshopOf(other),
          },
        ],
      }),
    );

    const before = useStore.getState().params;
    const undoDepth = useStore.getState().past.length;

    fireEvent.click(screen.getByRole('button', { name: /Apply .*The other shop/ }));
    await settle();

    const after = useStore.getState().params;
    expect(after.machine.travelX).toBe(3000);
    expect(after.materials.map((m) => m.id)).toEqual(['other-shop-18']);
    // The project's own copy changed. The profile's did not become the
    // project's — a later edit to one must not reach the other.
    expect(after.materials[0]).not.toBe(useStore.getState().profiles[0]!.settings.materials[0]);

    // One step, and it is a real one.
    expect(useStore.getState().past.length).toBe(undoDepth + 1);
    await change(() => useStore.getState().undo());
    expect(useStore.getState().params.machine.travelX).toBe(before.machine.travelX);
    expect(useStore.getState().params.materials.map((m) => m.id)).toEqual(
      before.materials.map((m) => m.id),
    );
  });

  it('reports every reference the change had to repoint', async () => {
    const other = defaultParams();
    other.materials = [{ ...other.materials[0]!, id: 'other-shop-18', name: '18 mm shop ply' }];
    other.carcassMaterialId = 'other-shop-18';
    other.shelfMaterialId = 'other-shop-18';
    other.drawerBoxMaterialId = 'other-shop-18';

    renderPanel(<WorkshopDrawer />);
    await settle();
    await change(() =>
      useStore.setState({
        profiles: [
          {
            id: 'p1',
            name: 'The other shop',
            savedAt: '2026-01-01T00:00:00Z',
            settings: workshopOf(other),
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply .*The other shop/ }));
    await settle();

    const notes = useStore.getState().workshopNotes;
    expect(notes[0]).toContain('The other shop');
    expect(notes.length).toBeGreaterThan(1);
    // Something on screen, not only in the store: a note nobody sees is not
    // "loud", which is the whole reason applying is not a pointer.
    expect(document.querySelector('.workshop')!.textContent).toContain(notes[0]!);
  });
});

describe('the door says what is behind it', () => {
  /**
   * "Two errors about the machine are the first thing a new user sees" was
   * R-21's finding, and the badge is the answer: the count on the Workshop
   * button must be the errors this drawer can actually fix, never the whole
   * list. A badge that claims a design problem is fixable in here sends
   * somebody looking for a control that does not exist.
   */
  it('the badge counts only the errors the drawer can fix', async () => {
    // The shipped default: sheets wider than the machine's travel, which is
    // exactly a workshop problem and exactly what the badge is for.
    resetStore(defaultParams());
    renderPanel(<TopBar />);
    await settle();

    const diagnostics = useStore.getState().project.diagnostics;
    const workshopErrors = diagnostics.filter(
      (d) => d.severity === 'error' && isWorkshopTopic(d.topic),
    ).length;
    expect(workshopErrors).toBeGreaterThan(0);

    const button = screen.getByRole('button', { name: /Workshop/ });
    expect(within(button).getByText(String(workshopErrors))).toBeTruthy();
  });
});

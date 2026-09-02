import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, type ProjectParams, type ProjectResult } from '@cabgen/core';
import { dragPlanFor, dragReadout, snapDrag, type DragPlan } from '../src/drag';

/**
 * Dragging a panel in the model.
 *
 * The whole risk of direct manipulation is that it becomes a second editor
 * that disagrees with the field beside it. These pin the other half: a drag
 * writes the ordinary parameter, the pipeline uses what it wrote rather than
 * falling back to an even split, and the number it lands on is one somebody
 * would have typed.
 */

/** The default project with a base carcass of three bays, the middle one shelved. */
function threeBays(): ProjectParams {
  const params = defaultParams();
  const carcass = params.cabinets[0]!.carcasses[0]!;
  carcass.dividerCount = 2;
  carcass.bayWidths = [];
  carcass.bays = [0, 1, 2].map((i) => ({
    shelves: i === 1 ? ('fixed' as const) : ('none' as const),
    shelfCount: i === 1 ? 2 : 0,
    shelfGaps: [],
    doors: 'none' as const,
    drawerFrontHeights: [],
  }));
  return params;
}

const build = (params: ProjectParams): ProjectResult => buildProject(params);

const planFor = (project: ProjectResult, params: ProjectParams, partId: string): DragPlan => {
  const plan = dragPlanFor(project, params, partId);
  if (!plan) throw new Error(`No drag plan for '${partId}'.`);
  return plan;
};

/** Apply a plan the way the viewport does: through a copy of the parameters. */
function committed(params: ProjectParams, plan: DragPlan, value: number): ProjectParams {
  const next = structuredClone(params);
  plan.commit(next, value);
  return next;
}

describe('dragging a divider', () => {
  it('sets the bay on its low side, and takes the width off the one beyond it', () => {
    const params = threeBays();
    const project = build(params);
    const plan = planFor(project, params, 'C1-B-DIV-1');
    expect(plan.axis).toBe('x');
    expect(plan.label).toBe('Bay 1');

    const next = committed(params, plan, plan.from - 100);
    const moved = build(next);
    const bays = moved.bays.filter((b) => b.carcassId === 'B');
    expect(bays[0]!.box.max.x - bays[0]!.box.min.x).toBeCloseTo(plan.from - 100, 1);
    // The third bay is not in the pair, so nothing it holds may move.
    expect(bays[2]!.box.min.x).toBeCloseTo(
      project.bays.filter((b) => b.carcassId === 'B')[2]!.box.min.x,
      6,
    );
  });

  /**
   * The widths a drag writes have to be ones the builder will use. Widths that
   * do not add up are silently split evenly again — the divider would spring
   * back to the middle the moment the hand let go.
   */
  it('writes widths the builder uses as given', () => {
    const params = threeBays();
    const plan = planFor(build(params), params, 'C1-B-DIV-1');
    const next = committed(params, plan, plan.from - 100);
    expect(build(next).notes.some((n) => n.includes('bay widths did not add up'))).toBe(false);
  });

  /**
   * The failure this catches: seeding the new list from `bayWidths` when the
   * builder had already rejected it. The stored widths do not add up, so they
   * are not what is on screen; a list built from them does not add up either,
   * and the drag moves nothing at all while appearing to work.
   */
  it('moves the divider even when the stored widths were rejected', () => {
    const params = threeBays();
    params.cabinets[0]!.carcasses[0]!.bayWidths = [100, 100, 100];
    const project = build(params);
    expect(project.notes.some((n) => n.includes('bay widths did not add up'))).toBe(true);

    const plan = planFor(project, params, 'C1-B-DIV-1');
    const moved = build(committed(params, plan, plan.from - 80));
    const first = moved.bays.filter((b) => b.carcassId === 'B')[0]!;
    expect(first.box.max.x - first.box.min.x).toBeCloseTo(plan.from - 80, 1);
    expect(moved.notes.some((n) => n.includes('bay widths did not add up'))).toBe(false);
  });

  it('will not squeeze either bay past what its own field accepts', () => {
    const params = threeBays();
    const plan = planFor(build(params), params, 'C1-B-DIV-1');
    expect(snapDrag(plan, -5000).value).toBeGreaterThanOrEqual(plan.min);
    expect(snapDrag(plan, 5000).value).toBeLessThanOrEqual(plan.max);
    expect(plan.min).toBeGreaterThan(0);
  });
});

describe('dragging a fixed shelf', () => {
  it('sets the clear height under it', () => {
    const params = threeBays();
    const project = build(params);
    const plan = planFor(project, params, 'C1-B-SHELF-2-1');
    expect(plan.axis).toBe('z');
    expect(plan.label).toBe('Under shelf 1');

    const next = committed(params, plan, plan.from + 60);
    const moved = build(next);
    expect(moved.notes.some((n) => n.includes('shelf heights did not add up'))).toBe(false);

    const before = project.parts.find((p) => p.id === 'C1-B-SHELF-2-1')!;
    const after = moved.parts.find((p) => p.id === 'C1-B-SHELF-2-1')!;
    expect(after.box.min.z - before.box.min.z).toBeCloseTo(60, 1);
    // The shelf above it does not move: the drag borrows from the opening it
    // shares with this one, not from the whole stack.
    expect(moved.parts.find((p) => p.id === 'C1-B-SHELF-2-2')!.box.min.z).toBeCloseTo(
      project.parts.find((p) => p.id === 'C1-B-SHELF-2-2')!.box.min.z,
      6,
    );
  });

  it('moves the shelf even when the stored heights were rejected', () => {
    const params = threeBays();
    params.cabinets[0]!.carcasses[0]!.bays[1]!.shelfGaps = [10, 10, 10];
    const project = build(params);
    expect(project.notes.some((n) => n.includes('shelf heights did not add up'))).toBe(true);

    const plan = planFor(project, params, 'C1-B-SHELF-2-1');
    const moved = build(committed(params, plan, plan.from + 60));
    expect(moved.notes.some((n) => n.includes('shelf heights did not add up'))).toBe(false);
    expect(
      moved.parts.find((p) => p.id === 'C1-B-SHELF-2-1')!.box.min.z -
        project.parts.find((p) => p.id === 'C1-B-SHELF-2-1')!.box.min.z,
    ).toBeCloseTo(60, 1);
  });

  /**
   * The 32 mm snap has to mean the shelf lands where a pin could have held it.
   * Snapping the *gap* rather than the height only ever lines up the lowest
   * shelf; every one above it comes out a shelf thickness off the ladder,
   * which is exactly the wrong answer for the person comparing the two.
   */
  it('snaps to the ladder the pins are bored on, not to the gap', () => {
    const params = threeBays();
    const project = build(params);
    const volume = project.bays.find((b) => b.carcassId === 'B' && b.index === 1)!;
    const upper = planFor(project, params, 'C1-B-SHELF-2-2');

    // Well clear of the equal split, which has a wider target on purpose and
    // would otherwise be the nearest thing to land on.
    const wanted = upper.from + 40;
    const ladder = Math.round((upper.moduleOffset + wanted) / 32) * 32 - upper.moduleOffset;
    const { value, why } = snapDrag(upper, ladder + 2);
    expect(why).toBe('module');
    const moved = build(committed(params, upper, value));
    const face = moved.parts.find((p) => p.id === 'C1-B-SHELF-2-2')!.box.min.z;
    expect((face - volume.shelfRun.z0) % 32).toBeCloseTo(0, 6);
  });

  /**
   * An adjustable shelf sits wherever its owner drops it on the pins. There is
   * no parameter for a drag to write, so offering one would be a control that
   * silently does nothing.
   */
  it('is not offered for an adjustable shelf', () => {
    const params = threeBays();
    const bay = params.cabinets[0]!.carcasses[0]!.bays[1]!;
    bay.shelves = 'adjustable';
    const project = build(params);
    expect(dragPlanFor(project, params, 'C1-B-SHELF-ADJ-2')).toBeNull();
  });

  it('is not offered for a panel that has no opening to give width to', () => {
    const params = threeBays();
    const project = build(params);
    expect(dragPlanFor(project, params, 'C1-B-SIDE-L')).toBeNull();
    expect(dragPlanFor(project, params, 'C1-B-TOP')).toBeNull();
  });
});

describe('where a drag lands', () => {
  const params = threeBays();
  const plan = planFor(build(params), params, 'C1-B-DIV-1');

  it('never lands on a number nobody would type', () => {
    // The failure this exists to prevent: a bay 437.3 mm wide, which reads as
    // a mistake on the cut list and is one nobody chose.
    for (const raw of [200.4, 311.77, 402.9, 254.31]) {
      const { value } = snapDrag(plan, raw);
      expect(Number.isInteger(value), `${raw} -> ${value}`).toBe(true);
    }
  });

  it('takes the equal split over a round number, because it is the one people want', () => {
    const equal = plan.snaps.find((s) => s.why === 'equal')!.at;
    // Equal is not a round ten here, so without the wider target for a named
    // snap it could never be reached by dragging at all.
    expect(Math.round(equal / 10) * 10).not.toBeCloseTo(equal, 1);
    const { value, why } = snapDrag(plan, equal + 4);
    expect(why).toBe('equal');
    expect(value).toBeCloseTo(equal, 6);
  });

  it('lands on the 32 mm module when that is the nearest thing', () => {
    const { value, why } = snapDrag(plan, 384 + 1);
    expect(why).toBe('module');
    expect(value).toBe(384);
    expect(dragReadout(plan, value, why)).toBe('Bay 1 · 384 mm · 32 mm system');
  });

  it('rounds to a whole ten when nothing better is in reach', () => {
    const { value, why } = snapDrag(plan, 349.6);
    expect(why).toBe('round');
    expect(value).toBe(350);
  });
});

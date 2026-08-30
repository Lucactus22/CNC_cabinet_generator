import { describe, expect, it } from 'vitest';
import { base, upper } from './carcasses.js';
import {
  buildAssemblyPlan,
  buildParts,
  buildProject,
  CABINET_TYPES,
  defaultBaseCarcass,
  defaultParams,
  HANDLE_BAR_128,
  PIN_5MM,
  SLIDE_BLUM_TANDEM_H,
  type AssemblyStep,
  type ProjectParams,
} from '../src/index.js';

/**
 * R-10. The assembly guide is only trustworthy if it falls out of whatever
 * the builder actually produced for *this* project — a hand-authored sequence
 * that happens to match the default cabinet would silently mislead on the
 * first project that looks different, which is exactly the failure this repo
 * exists to avoid (see R-01).
 */

/** Index of the first step mentioning a part, or -1 if it never appears. */
function stepOf(steps: AssemblyStep[], partId: string): number {
  return steps.findIndex((s) => s.partIds.includes(partId));
}

describe('assembly plan: structural ordering', () => {
  it('fits the female panel of every joint before the male that houses into it', () => {
    // Built straight from buildParts, not the full pipeline: the order only
    // depends on the joint requests, never on the machined geometry.
    const params = defaultParams();
    const built = buildParts(params);
    const { steps } = buildAssemblyPlan(params, built.parts, built);

    const firstStep = new Map<string, number>();
    steps.forEach((step, i) => {
      for (const id of step.partIds) if (!firstStep.has(id)) firstStep.set(id, i);
    });

    expect(built.joints.length).toBeGreaterThan(0);
    for (const j of built.joints) {
      const femaleAt = firstStep.get(j.femaleId);
      const maleAt = firstStep.get(j.maleId);
      expect(femaleAt, `${j.femaleId} never appears in a step`).toBeDefined();
      expect(maleAt, `${j.maleId} never appears in a step`).toBeDefined();
      expect(femaleAt!).toBeLessThan(maleAt!);
    }
  });

  it('caps the sides growing up into it before the sides, since the base is capped', () => {
    // JOINERY.md: "the sides run up into shallow dados in the top's
    // underside" — the top is the female here, so it has to be in place
    // first, not the sides.
    const project = buildProject(defaultParams());
    const steps = project.assembly.steps;
    expect(stepOf(steps, 'C1-B-TOP')).toBeLessThan(stepOf(steps, 'C1-B-SIDE-L'));
    expect(stepOf(steps, 'C1-B-TOP')).toBeLessThan(stepOf(steps, 'C1-B-SIDE-R'));
  });

  it('fits the sides before an inset top, the other way round from a capped one', () => {
    const project = buildProject(defaultParams());
    const steps = project.assembly.steps;
    expect(stepOf(steps, 'C1-T-SIDE-L')).toBeLessThan(stepOf(steps, 'C1-T-TOP'));
  });

  it('fits the sides and bottom before the back, which is captured on both', () => {
    const project = buildProject(defaultParams());
    const steps = project.assembly.steps;
    const backAt = stepOf(steps, 'C1-B-BACK');
    expect(stepOf(steps, 'C1-B-SIDE-L')).toBeLessThan(backAt);
    expect(stepOf(steps, 'C1-B-BOTTOM')).toBeLessThan(backAt);
  });

  it('fits a carcass with no bottom of its own onto the one below it before its own back', () => {
    const params = defaultParams();
    upper(params).floor = 'below';
    const project = buildProject(params);
    const steps = project.assembly.steps;
    // The upper's sides stand in locating dados in the base's own top — a
    // cross-carcass dependency the layering has to pick up from the joint
    // graph, not from the two carcasses being built in order.
    expect(stepOf(steps, 'C1-B-TOP')).toBeLessThan(stepOf(steps, 'C1-T-SIDE-L'));
    expect(stepOf(steps, 'C1-T-SIDE-L')).toBeLessThan(stepOf(steps, 'C1-T-BACK'));
  });

  it('never straddles two carcasses in one step', () => {
    const project = buildProject(defaultParams());
    for (const step of project.assembly.steps) {
      const carcasses = new Set(
        step.partIds.map((id) => project.parts.find((p) => p.id === id)?.carcassId),
      );
      expect(carcasses.size).toBeLessThanOrEqual(1);
    }
  });

  it('finishes one cabinet — structure, doors and all — before starting the next', () => {
    // Doors, drawers and leftovers are their own phases, layered in after
    // structure across the whole run; without grouping by cabinet ahead of
    // phase, cabinet 1's doors would land after cabinet 2's carcass was
    // already built, which is exactly the back-and-forth a step-by-step
    // guide exists to prevent.
    const params = defaultParams();
    params.cabinets.push({ id: 'C2', name: 'Second unit', carcasses: [defaultBaseCarcass()] });
    const project = buildProject(params);

    const cabinetOf = (id: string): string | undefined =>
      project.parts.find((p) => p.id === id)?.cabinetId;
    const indicesFor = (cabinetId: string): number[] =>
      project.assembly.steps
        .map((s, i) => (s.partIds.some((id) => cabinetOf(id) === cabinetId) ? i : -1))
        .filter((i) => i >= 0);

    const c1 = indicesFor('C1');
    const c2 = indicesFor('C2');
    expect(c1.length).toBeGreaterThan(0);
    expect(c2.length).toBeGreaterThan(0);
    expect(Math.max(...c1)).toBeLessThan(Math.min(...c2));
  });

  it('names the carcass alone with one cabinet, and prefixes the cabinet once there are several', () => {
    const one = buildProject(defaultParams());
    const step = one.assembly.steps[stepOf(one.assembly.steps, 'C1-B-TOP')]!;
    expect(step.title.startsWith('Base:')).toBe(true);

    const params = defaultParams();
    params.cabinets.push({ id: 'C2', name: 'Second unit', carcasses: [defaultBaseCarcass()] });
    const many = buildProject(params);
    const step2 = many.assembly.steps[stepOf(many.assembly.steps, 'C1-B-TOP')]!;
    // 'Stacked unit' is the default cabinet's own name (params.name is the
    // project's, a different thing entirely — see model/defaults.ts).
    expect(step2.title.startsWith('Stacked unit base:')).toBe(true);
  });
});

describe('assembly plan: fixings follow the joinery settings', () => {
  it('calls out screws through pre-drilled clearance holes when screws are on', () => {
    const project = buildProject(defaultParams());
    const step = project.assembly.steps[stepOf(project.assembly.steps, 'C1-B-BOTTOM')]!;
    expect(step.fixings.join(' ')).toContain('screws');
    expect(step.fixings.join(' ')).toContain('4.5 mm');
  });

  it('drops to glue only when screw holes are switched off', () => {
    const params = defaultParams();
    params.joinery.screwHoles = false;
    const project = buildProject(params);
    const step = project.assembly.steps[stepOf(project.assembly.steps, 'C1-B-BOTTOM')]!;
    expect(step.fixings.some((f) => f.toLowerCase().includes('screw'))).toBe(false);
  });

  it('calls a divider self-jigging under tab-and-slot, where under dado it is screwed', () => {
    // The divider's own joints (into the floor and the top) carry no
    // forceDado override, so they are the ones carcassJoint actually
    // switches — unlike the back or the toe kick rail, which are always a
    // plain dado whatever this setting is.
    const dado = buildProject(defaultParams());
    const dadoStep = dado.assembly.steps[stepOf(dado.assembly.steps, 'C1-B-DIV-1')]!;
    expect(dadoStep.fixings.join(' ')).toContain('4.5 mm');

    const params = defaultParams();
    params.joinery.carcassJoint = 'tabslot';
    const project = buildProject(params);
    const step = project.assembly.steps[stepOf(project.assembly.steps, 'C1-B-DIV-1')]!;
    expect(step.fixings.join(' ')).toContain('self-jigging');
  });

  it('never claims screws for a back panel, which is always a plain glued groove', () => {
    // dado.ts never drills screw holes for a back joint, whatever screwHoles
    // or carcassJoint are set to — see joinery/dado.ts's own purpose !==
    // 'back' guard. The back can share a step with another panel (here, the
    // divider) that legitimately does get screwed, so the check has to be
    // for the back's own message rather than the absence of the word
    // anywhere in the step.
    const project = buildProject(defaultParams());
    const step = project.assembly.steps[stepOf(project.assembly.steps, 'C1-B-BACK')]!;
    expect(step.fixings).toContain('Glue only, captured in a plain housing groove.');
  });
});

describe('assembly plan: doors', () => {
  it('hangs each door with its own hinge count and no handle by default', () => {
    const params = defaultParams();
    const built = buildParts(params);
    const project = buildProject(params);
    const leftDoorId = built.hinges.find((h) => h.side === 'low')!.doorId;
    const step = project.assembly.steps[stepOf(project.assembly.steps, leftDoorId)]!;
    const expectedHinges = built.hinges.find((h) => h.doorId === leftDoorId)!.heights.length;

    expect(step.hardware).toEqual([`${expectedHinges} × IKEA UTRUSTA 110°`]);
    expect(step.hardware.some((h) => h.includes('handle'))).toBe(false);
  });

  it('adds the handle to the same step once one is selected', () => {
    const params = defaultParams();
    params.hardware.handleId = HANDLE_BAR_128.id;
    const built = buildParts(params);
    const project = buildProject(params);
    const doorId = built.hinges[0]!.doorId;
    const step = project.assembly.steps[stepOf(project.assembly.steps, doorId)]!;

    expect(step.hardware).toContain(`1 × ${HANDLE_BAR_128.name}`);
    expect(step.fixings.some((f) => f.includes('Handle fixing screw'))).toBe(true);
  });
});

describe('assembly plan: drawers', () => {
  const withDrawers = (heights: number[]): ProjectParams => {
    const p = defaultParams();
    base(p).bays[0] = {
      shelves: 'none',
      shelfCount: 0,
      doors: 'none',
      drawerFrontHeights: heights,
    };
    return p;
  };

  it('mounts the box on its runners with a screw count matching the holes actually bored', () => {
    const params = withDrawers([200, 200]);
    const built = buildParts(params);
    const project = buildProject(params);
    const req = built.slides[0]!;
    // The box's own sides are jointed to its front and back too (see
    // build/drawers.ts), so they legitimately appear in an earlier,
    // structural "build the box" step as well as this one — the mounting
    // step has to be found by what it is, not by the first step mentioning
    // one of its parts.
    const step = project.assembly.steps.find((s) =>
      s.hardware.some((h) => h.includes(SLIDE_BLUM_TANDEM_H.name)),
    )!;
    expect(step).toBeDefined();

    // Cross-checked against the holes hardware/slides.ts actually bored on
    // one box side, not a second copy of its placement formula: if that
    // formula ever changes (a third anchor point, say) without this file
    // following, the mismatch fails here rather than shipping a guide that
    // states the wrong count.
    const boxLeft = project.parts.find((p) => p.id === req.boxLeftId)!;
    const actualHoles = boxLeft.features.filter(
      (f) => f.kind === 'drill' && f.purpose === 'slide-side',
    ).length;
    expect(actualHoles).toBeGreaterThan(0);
    expect(step.fixings).toEqual([
      `${actualHoles * 4} × Ø${req.screwDiameter} mm mounting screws (runner to box and carcass).`,
    ]);
    expect(step.partIds).toEqual(expect.arrayContaining([req.boxLeftId, req.boxRightId]));
  });

  it('builds the box itself as a structural step, before the separate step that mounts it', () => {
    // A box side is jointed to the front and back (build/drawers.ts), so it
    // is genuinely fitted twice over: once gluing the box up, again sliding
    // the finished box into the carcass on its runners. Appearing in two
    // steps is correct here, not a duplicate.
    const params = withDrawers([200, 200]);
    const built = buildParts(params);
    const project = buildProject(params);
    const req = built.slides[0]!;
    const containing = project.assembly.steps.filter((s) => s.partIds.includes(req.boxLeftId));
    expect(containing.length).toBe(2);
    expect(containing[0]!.hardware).toEqual([]);
    expect(containing[1]!.hardware[0]).toContain(SLIDE_BLUM_TANDEM_H.name);
  });

  it('leaves the drawer face for its own step, screwed on from inside the box', () => {
    const params = withDrawers([200, 200]);
    const project = buildProject(params);
    const face = project.parts.find((p) => p.role === 'drawer-face')!;
    const step = project.assembly.steps[stepOf(project.assembly.steps, face.id)]!;
    expect(step.fixings.join(' ')).toContain('inside the box');
  });
});

describe('assembly plan: whatever is left', () => {
  it('drops in the adjustable shelf with its pins, never silently missing it', () => {
    const project = buildProject(defaultParams());
    const shelf = project.parts.find((p) => p.role === 'shelf' && p.id.includes('ADJ'))!;
    const step = project.assembly.steps[stepOf(project.assembly.steps, shelf.id)]!;
    expect(step.title).toContain('Drop in');
    expect(step.hardware[0]).toContain(PIN_5MM.name);
  });

  it('places every single part somewhere in the guide', () => {
    const variants: ProjectParams[] = [
      defaultParams(),
      (() => {
        const p = defaultParams();
        base(p).bays[0] = {
          shelves: 'none',
          shelfCount: 0,
          doors: 'none',
          drawerFrontHeights: [200, 200],
        };
        return p;
      })(),
      (() => {
        const p = defaultParams();
        base(p).construction = 'face-frame';
        return p;
      })(),
      (() => {
        const p = defaultParams();
        const wall = CABINET_TYPES.find((t) => t.id === 'wall')!.build();
        p.cabinets.push({ ...wall, id: 'C2' });
        return p;
      })(),
    ];
    for (const params of variants) {
      const project = buildProject(params);
      const placed = new Set(project.assembly.steps.flatMap((s) => s.partIds));
      const missing = project.parts.filter((p) => !placed.has(p.id));
      expect(missing.map((p) => p.id)).toEqual([]);
    }
  });
});

describe('assembly plan: site fit', () => {
  it('produces no scribe step when the opening is switched off', () => {
    const project = buildProject(defaultParams());
    expect(project.assembly.steps.some((s) => s.title.includes('Scribe'))).toBe(false);
  });

  it('fixes a wall cabinet to the wall with the hanging rail screw count, on site', () => {
    const params = defaultParams();
    const wall = CABINET_TYPES.find((t) => t.id === 'wall')!.build();
    params.cabinets = [{ ...wall, id: 'C1' }];
    const built = buildParts(params);
    const project = buildProject(params);
    const expectedScrews = built.wallMounts.reduce((a, m) => a + m.xs.length, 0);
    expect(expectedScrews).toBeGreaterThan(0);

    const step = project.assembly.steps.find((s) => s.title === 'Fix to the wall')!;
    expect(step).toBeDefined();
    expect(step.fixings[0]).toContain(`${expectedScrews} ×`);
  });
});

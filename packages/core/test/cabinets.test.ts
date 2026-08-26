import { describe, expect, it } from 'vitest';
import {
  buildProject,
  cabinetPositions,
  defaultCabinet,
  defaultParams,
  duplicateCabinet,
  newCabinet,
  newCarcass,
  nextCabinetId,
  nextCarcassId,
  normaliseParams,
  resolveWidths,
} from '../src/index.js';
import type { Cabinet, Part, ProjectParams } from '../src/index.js';
import { base, carcass, upper } from './carcasses.js';

/** A run of `n` copies of the default cabinet, standing side by side. */
function run(n: number): ProjectParams {
  const params = defaultParams();
  while (params.cabinets.length < n) {
    const copy = duplicateCabinet(params.cabinets[0]!, params.cabinets);
    copy.name = `Cabinet ${params.cabinets.length + 1}`;
    params.cabinets.push(copy);
  }
  return params;
}

/**
 * What a part tells the machine, at the precision the DXF is written to.
 *
 * Local coordinates come from subtracting the part's own origin out of assembly
 * space, so a cabinet standing a metre along the run carries that metre of
 * magnitude through the subtraction and lands a fraction of a nanometre away
 * from the same cabinet at the origin. The DXF writer emits six decimal places,
 * so rounding to those is comparing exactly what reaches the spindle rather than
 * the last bits of a double.
 */
function machining(part: Part): string {
  return JSON.stringify({ outline: part.outline, features: part.features }, (_key, value) =>
    typeof value === 'number' ? Number(value.toFixed(6)) : value,
  );
}

const partsOf = (parts: Part[], cabinetId: string): Part[] =>
  parts.filter((p) => p.cabinetId === cabinetId);

const find = (parts: Part[], id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`No part '${id}'. Have: ${parts.map((x) => x.id).join(', ')}`);
  return p;
};

describe('a run of cabinets', () => {
  it('stands each cabinet where the one before it ends', () => {
    const project = buildProject(run(3));
    // Two units butted together with a gap between them is a gap you find out
    // about at the wall, with the panels already cut.
    const spans = ['C1', 'C2', 'C3'].map((id) => {
      const mine = partsOf(project.parts, id);
      return {
        x0: Math.min(...mine.map((p) => p.box.min.x)),
        x1: Math.max(...mine.map((p) => p.box.max.x)),
      };
    });
    expect(spans[0]!.x0).toBeCloseTo(0, 6);
    expect(spans[1]!.x0).toBeCloseTo(spans[0]!.x1, 6);
    expect(spans[2]!.x0).toBeCloseTo(spans[1]!.x1, 6);
  });

  it('measures the run by the widest carcass in each stack', () => {
    const params = run(2);
    upper(params).linkWidthToBelow = false;
    upper(params).width = 1200; // wider than the 900 base under it
    const positions = cabinetPositions(params.cabinets);
    expect(positions[0]).toEqual({ id: 'C1', x: 0, w: 1200 });
    // The second cabinet has to clear the overhanging upper, not just the base.
    expect(positions[1]!.x).toBe(1200);
  });

  it('gives every part an id that names its cabinet, and never repeats one', () => {
    const project = buildProject(run(3));
    for (const part of project.parts) {
      expect(part.id.startsWith(`${part.cabinetId}-${part.carcassId}-`)).toBe(true);
    }
    const ids = project.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nests and lists every cabinet in the run, not just the first', () => {
    const one = buildProject(defaultParams());
    const three = buildProject(run(3));

    expect(three.parts.length).toBe(one.parts.length * 3);
    expect(three.cutList).toHaveLength(three.parts.length);
    expect(new Set(three.cutList.map((r) => r.cabinet)).size).toBe(3);

    // Every part has to land on a sheet. A part quietly missing from the nest
    // is a part that never gets cut.
    const nested = new Set(three.nest.sheets.flatMap((s) => s.parts.map((p) => p.partId)));
    expect(nested.size).toBe(three.parts.length);
    expect(three.nest.unplaced).toEqual([]);
  });

  /**
   * The invariant that catches state leaking between cabinets.
   *
   * Two identical cabinets standing next to each other have to come off the
   * machine as identical blanks. Anything that decides a part's machining from
   * the whole assembly rather than from its own cabinet breaks this — the
   * inside/outside face of a surface effect did exactly that, and would have
   * cut the panelling on the wrong face of every unit but the middle one.
   */
  it('cuts identical cabinets into identical parts', () => {
    const params = run(2);
    params.surfaceEffects = [
      {
        id: 'fx1',
        enabled: true,
        target: { select: 'role', role: 'side' },
        face: 'inside',
        effect: {
          kind: 'grooves',
          direction: 'vertical',
          spacing: 60,
          width: 6,
          depth: 3,
          margin: 0,
          fit: 'even',
        },
      },
    ];
    const parts = buildProject(params).parts;
    const dx = cabinetPositions(params.cabinets)[1]!.x;

    for (const first of partsOf(parts, 'C1')) {
      const second = find(parts, first.id.replace(/^C1-/, 'C2-'));
      // The engraved id is the one thing that is meant to differ.
      expect(machining(second).replaceAll('C2-', 'C1-')).toBe(machining(first));
      expect(second.box.min.x - first.box.min.x).toBeCloseTo(dx, 6);
      expect(second.box.min.z).toBeCloseTo(first.box.min.z, 6);
    }
  });

  it('leaves the other cabinets alone when one is removed', () => {
    const three = run(3);
    const before = buildProject(three).parts;

    const twoLeft = run(3);
    twoLeft.cabinets = twoLeft.cabinets.filter((c) => c.id !== 'C2');
    const after = buildProject(twoLeft).parts;

    // The first cabinet has not moved at all.
    for (const part of partsOf(before, 'C1')) {
      expect(find(after, part.id).box).toEqual(part.box);
      expect(machining(find(after, part.id))).toBe(machining(part));
    }
    // The third has closed the gap, but is otherwise the same panel.
    const gap = cabinetPositions(three.cabinets)[1]!.w;
    for (const part of partsOf(before, 'C3')) {
      const moved = find(after, part.id);
      expect(part.box.min.x - moved.box.min.x).toBeCloseTo(gap, 6);
      expect(machining(moved)).toBe(machining(part));
    }
  });
});

describe('a stack of carcasses', () => {
  it('takes more than two', () => {
    const params = defaultParams();
    const stack = params.cabinets[0]!.carcasses;
    stack.push(newCarcass(stack));
    const third = stack[2]!;
    expect(third.id).toBe('T2');

    const project = buildProject(params);
    const top = find(project.parts, `C1-${third.id}-TOP`);
    // It stands on everything below it, not at some remembered height.
    expect(top.box.max.z).toBeCloseTo(base(params).height + upper(params).height + third.height, 6);
  });

  it('follows a width link down the whole stack, not just one box', () => {
    const params = defaultParams();
    const stack = params.cabinets[0]!.carcasses;
    stack.push(newCarcass(stack));
    base(params).width = 1100;
    for (const c of stack.slice(1)) c.linkWidthToBelow = true;

    // A link three boxes deep has to land on the width actually set at the
    // bottom, or the stack steps in halfway up.
    expect(resolveWidths(stack).map((c) => c.width)).toEqual([1100, 1100, 1100]);
  });

  it('stands a carcass in the top of the one below it, whichever that is', () => {
    const params = defaultParams();
    const stack = params.cabinets[0]!.carcasses;
    stack.push(newCarcass(stack));
    stack[2]!.floor = 'below';
    stack[1]!.topStyle = 'capped';

    const project = buildProject(params);
    expect(project.parts.some((p) => p.id === 'C1-T2-BOTTOM')).toBe(false);
    // The locating dados go into the upper's top, not the base's.
    const upperTop = find(project.parts, 'C1-T-TOP');
    expect(upperTop.features.some((f) => f.kind === 'pocket' && f.purpose === 'carcass')).toBe(
      true,
    );
  });

  it('gives the carcass on the ground its own bottom whatever the file says', () => {
    const params = defaultParams();
    base(params).floor = 'below';
    const project = buildProject(params);
    // There is nothing underneath to stand in, so silently omitting the bottom
    // panel would leave the box open to the floor.
    expect(project.parts.some((p) => p.id === 'C1-B-BOTTOM')).toBe(true);
    expect(project.notes.join(' ')).toMatch(/stands on the ground/);
  });

  it('measures an overhang against the carcass it stands on, not the one on the floor', () => {
    const params = defaultParams();
    const stack = params.cabinets[0]!.carcasses;
    stack.push(newCarcass(stack));
    base(params).depth = 600;
    upper(params).depth = 300;
    stack[2]!.depth = 500;

    // The third box hangs 200 mm off the panel carrying it. Compared against
    // the 600 mm box on the floor instead, it looks like it steps back and
    // nothing is said — which is how it reaches the wall before anyone notices.
    const notes = buildProject(params).notes.join(' ');
    expect(notes).toMatch(/200 mm deeper than the upper it stands on/);
  });

  it('names the cabinet in its notes once there is more than one', () => {
    const params = run(2);
    for (const cabinet of params.cabinets) cabinet.carcasses[1]!.toeKick.enabled = true;
    const notes = buildProject(params).notes.filter((n) => n.includes('not on the floor'));
    // Two cabinets both holding a carcass called 'Upper' would otherwise emit
    // the same sentence twice with nothing saying which unit is at fault.
    expect(notes).toHaveLength(2);
    expect(new Set(notes).size).toBe(2);
    expect(notes[0]).toMatch(/^Stacked unit upper/);
    expect(notes[1]).toMatch(/^Cabinet 2 upper/);
  });

  it('leaves a toe kick off a carcass that is not on the floor, and says so', () => {
    const params = defaultParams();
    upper(params).toeKick = { enabled: true, height: 100, setback: 50 };
    const project = buildProject(params);
    expect(project.parts.some((p) => p.id === 'C1-T-TOERAIL')).toBe(false);
    expect(project.notes.join(' ')).toMatch(/not on the floor/);
  });
});

describe('project diagnostics', () => {
  it('says so when the run is empty', () => {
    const params = defaultParams();
    params.cabinets = [];
    const project = buildProject(params);
    expect(project.parts).toEqual([]);
    expect(project.diagnostics.some((d) => d.message.includes('no cabinets'))).toBe(true);
  });

  it('says so when a cabinet has nothing in it', () => {
    const params = defaultParams();
    params.cabinets[0]!.carcasses = [];
    expect(buildProject(params).notes.join(' ')).toMatch(/no carcasses/);
  });

  it('catches two cabinets sharing an id', () => {
    const params = defaultParams();
    // Two panels answering to one id means the nester's map keeps one of them
    // and the other never reaches a sheet, while both get the same engraving.
    params.cabinets.push({ ...defaultCabinet() });
    const errs = buildProject(params).diagnostics.filter(
      (d) => d.severity === 'error' && d.topic === 'project',
    );
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]!.message).toMatch(/sharing an id/);
  });

  it('hands out ids nothing else has claimed', () => {
    const cabinets: Cabinet[] = [defaultCabinet()];
    expect(nextCabinetId(cabinets)).toBe('C2');
    cabinets.push(newCabinet(cabinets));
    expect(cabinets.map((c) => c.id)).toEqual(['C1', 'C2']);

    const stack = defaultCabinet().carcasses;
    expect(nextCarcassId(stack)).toBe('T2');
    expect(nextCarcassId([])).toBe('B');
  });

  it('renames a duplicated cabinet so its parts do not collide', () => {
    const params = defaultParams();
    const copy = duplicateCabinet(params.cabinets[0]!, params.cabinets);
    expect(copy.id).toBe('C2');
    // A shallow copy would have the two cabinets sharing bay arrays, so
    // editing one would silently change the other.
    copy.carcasses[0]!.bays[0]!.doors = 'none';
    expect(base(params).bays[0]!.doors).toBe('left');
  });
});

describe('opening a project saved before cabinets existed', () => {
  /** A 0.1 file, cut down to the fields that have to survive the migration. */
  const legacy = {
    name: 'Old unit',
    base: {
      topStyle: 'capped',
      width: 800,
      height: 850,
      depth: 560,
      dividerCount: 0,
      bayWidths: [],
      bays: [{ shelves: 'fixed', shelfCount: 2, doors: 'left' }],
      back: { style: 'rabbet', materialId: 'ply12', inset: 0 },
      toeKick: { enabled: true, height: 120, setback: 40 },
    },
    top: {
      topStyle: 'inset',
      width: 800,
      height: 900,
      depth: 300,
      linkWidthToBase: true,
      floor: 'base-top',
      dividerCount: 0,
      bayWidths: [],
      bays: [{ shelves: 'adjustable', shelfCount: 0, doors: 'none' }],
      back: { style: 'groove', materialId: 'ply12', inset: 12 },
    },
    surfaceEffects: [
      {
        id: 'fx1',
        enabled: true,
        target: { select: 'role', role: 'back', carcass: 'top' },
        face: 'inside',
        effect: {
          kind: 'grooves',
          direction: 'vertical',
          spacing: 60,
          width: 6,
          depth: 3,
          margin: 0,
          fit: 'even',
        },
      },
      {
        id: 'fx2',
        enabled: true,
        target: { select: 'part', partId: 'B-BACK' },
        face: 'inside',
        effect: { kind: 'frame', margin: 60, width: 8, depth: 4 },
      },
    ],
  };

  const params = normaliseParams(legacy);

  it('reads the two carcasses as one cabinet', () => {
    expect(params.cabinets).toHaveLength(1);
    expect(params.cabinets[0]!.carcasses.map((c) => c.id)).toEqual(['B', 'T']);
    expect(base(params).width).toBe(800);
    expect(base(params).toeKick).toEqual({ enabled: true, height: 120, setback: 40 });
    expect(base(params).back.style).toBe('rabbet');
  });

  it('carries over the settings that were named for the old pair', () => {
    // Left unmigrated these fall back to defaults, and the upper quietly grows
    // a bottom panel the user never asked for.
    expect(upper(params).linkWidthToBelow).toBe(true);
    expect(upper(params).floor).toBe('below');
    expect(upper(params).toeKick.enabled).toBe(false);
  });

  it('reads "both carcasses" as the whole project, which is what it meant', () => {
    const withBoth = normaliseParams({
      ...legacy,
      surfaceEffects: [
        { ...legacy.surfaceEffects[0]!, target: { select: 'role', role: 'back', carcass: 'both' } },
      ],
    });
    // The 0.1 file had one cabinet, so 'both carcasses' was every carcass there
    // was. Pinning it to C1 instead would name a scope the picker cannot offer
    // and leave the control blank.
    expect(withBoth.surfaceEffects[0]!.target).toEqual({ select: 'role', role: 'back' });
  });

  it('repoints the surface effects at panels that still exist', () => {
    const [byRole, byPart] = params.surfaceEffects;
    expect(byRole!.target).toEqual({
      select: 'role',
      role: 'back',
      cabinetId: 'C1',
      carcassId: 'T',
    });
    expect(byPart!.target).toEqual({ select: 'part', partId: 'C1-B-BACK' });

    // And they still land: an effect matching nothing is reported, not silent.
    const project = buildProject(params);
    expect(project.diagnostics.some((d) => d.message.includes('matches no panel'))).toBe(false);
    expect(
      find(project.parts, 'C1-T-BACK').features.some(
        (f) => f.kind === 'pocket' && f.purpose === 'surface-grooves',
      ),
    ).toBe(true);
  });

  it('cuts the same cabinet it always did', () => {
    const project = buildProject(params);
    expect(carcass(params, 'B').height).toBe(850);
    // The upper stood in the base top and had no bottom of its own; the base
    // had a toe kick. Both have to survive being read out of the old file.
    expect(project.parts.some((p) => p.id === 'C1-T-BOTTOM')).toBe(false);
    expect(project.parts.some((p) => p.id === 'C1-B-TOERAIL')).toBe(true);
    expect(project.diagnostics.filter((d) => d.topic === 'project')).toEqual([]);
  });
});

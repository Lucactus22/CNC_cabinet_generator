import { describe, expect, it } from 'vitest';
import {
  CABINET_TYPES,
  buildParts,
  buildProject,
  defaultParams,
  generate,
  newCabinetOfType,
  partsNeedingFlip,
  wallMountXs,
} from '../src/index.js';
import type { Part, PocketFeature } from '../src/model/types.js';

const find = (parts: Part[], id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}; have ${parts.map((x) => x.id).join(', ')}`);
  return p;
};

const pockets = (p: Part): PocketFeature[] =>
  p.features.filter((f): f is PocketFeature => f.kind === 'pocket');

describe('the cabinet type library', () => {
  it('offers the four types the roadmap calls for', () => {
    expect(CABINET_TYPES.map((t) => t.id).sort()).toEqual(['base', 'stacked', 'tall', 'wall']);
  });

  for (const type of CABINET_TYPES.map((t) => t.id)) {
    it(`builds a project from a fresh '${type}' cabinet with no error diagnostics`, () => {
      const params = defaultParams();
      params.cabinets = [newCabinetOfType(type, [])];
      // The stock machine (1000 mm travel) is narrower than the stock sheet
      // (1220 mm across), which is an error on its own and true of every
      // project built from defaultParams(). Widen it here so this test is
      // about the cabinet type, not that pre-existing mismatch.
      params.machine.travelX = 1300;
      params.machine.travelY = 1300;
      const project = buildProject(params);
      expect(project.parts.length).toBeGreaterThan(0);
      const errors = project.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toEqual([]);
    });
  }

  it('hands each new cabinet an id nothing else in the run has claimed', () => {
    const first = newCabinetOfType('base', []);
    const second = newCabinetOfType('wall', [first]);
    expect(second.id).not.toBe(first.id);
  });
});

describe('hanging rail', () => {
  // The default wall preset has a divider, splitting the rail into two
  // segments — see the collision test below for why it cannot be one piece.
  const params = defaultParams();
  params.cabinets = [newCabinetOfType('wall', [])];
  const railSpec = params.cabinets[0]!.carcasses[0]!.hangingRail;
  const { parts, warnings } = generate(params);
  const railIds = ['C1-B-HANGRAIL-1', 'C1-B-HANGRAIL-2'];

  it('is built for a wall cabinet, one segment per bay, each housed in its bounding panels', () => {
    for (const id of railIds) expect(find(parts, id).role).toBe('hanging-rail');
    // Bay 1 is bounded by the left side and the divider, bay 2 by the divider
    // and the right side - the divider should show a pocket from each side.
    for (const id of ['C1-B-SIDE-L', 'C1-B-SIDE-R', 'C1-B-DIV-1']) {
      const panel = find(parts, id);
      expect(pockets(panel).some((f) => f.purpose === 'hanging-rail')).toBe(true);
    }
  });

  it('does not span across the divider it is split around', () => {
    // A single rail spanning the full width would fully contain the divider's
    // footprint - the divider always reaches the top regardless of the rail,
    // since it is jointed there, so cutting that would jam the two together.
    // A rail segment may only grow the width of its own dado tongue into the
    // divider, exactly like any other captured panel meeting it.
    const divider = find(parts, 'C1-B-DIV-1');
    for (const id of railIds) {
      const rail = find(parts, id);
      const overlapX =
        Math.min(rail.box.max.x, divider.box.max.x) - Math.max(rail.box.min.x, divider.box.min.x);
      expect(overlapX).toBeLessThanOrEqual(params.joinery.dadoDepth + 1e-6);
    }
  });

  it('sits flush under the top and against the back, not overlapping either', () => {
    const top = find(parts, 'C1-B-TOP');
    const back = find(parts, 'C1-B-BACK');
    for (const id of railIds) {
      const rail = find(parts, id);
      expect(rail.box.max.z).toBeCloseTo(top.box.min.z, 6);
      expect(rail.box.max.y).toBeCloseTo(back.box.min.y, 6);
    }
  });

  it('is drilled for at least two mounting screws per segment, at the size the spec asks for', () => {
    for (const id of railIds) {
      const rail = find(parts, id);
      const holes = rail.features.filter((f) => f.kind === 'drill' && f.purpose === 'wall-mount');
      expect(holes.length).toBeGreaterThanOrEqual(2);
      for (const h of holes) {
        if (h.kind !== 'drill') continue;
        expect(h.diameter).toBe(railSpec.screwDiameter);
        // A blind hole here would need the installer to guess how deep the
        // screw driven from inside the cabinet has to go to clear the rail.
        expect(h.depth).toBe('thru');
      }
    }
  });

  it('never forces a rail segment onto a second face, since every hole goes right through', () => {
    const flipped = partsNeedingFlip(parts).map((p) => p.id);
    for (const id of railIds) expect(flipped).not.toContain(id);
  });

  it('builds clean by default, with no warnings', () => {
    expect(warnings).toEqual([]);
  });

  it('is left out of the other types, which have no use for it', () => {
    for (const type of ['base', 'tall', 'stacked'] as const) {
      const p = defaultParams();
      p.cabinets = [newCabinetOfType(type, [])];
      const built = buildParts(p);
      expect(built.parts.some((part) => part.role === 'hanging-rail')).toBe(false);
    }
  });

  it('says so, and names the fix, when the rail leaves no room for the interior', () => {
    const p = defaultParams();
    p.cabinets = [newCabinetOfType('wall', [])];
    p.cabinets[0]!.carcasses[0]!.hangingRail.height = 2000;
    const notes = buildParts(p).notes.join(' ');
    expect(notes).toMatch(/hanging rail leaves no room for the carcass interior/);
  });

  it('stays a plain housed dado even when the carcass joint is set to tab-and-slot', () => {
    // Like the back and the toe rail, a hanging rail gains nothing from being
    // a through tab visible on the outside of the cabinet.
    const p = defaultParams();
    p.cabinets = [newCabinetOfType('wall', [])];
    p.joinery.carcassJoint = 'tabslot';
    const { parts: tabParts, warnings: tabWarnings } = generate(p);
    const side = find(tabParts, 'C1-B-SIDE-L');
    expect(pockets(side).some((f) => f.purpose === 'hanging-rail')).toBe(true);

    // The divider is the case that actually broke: under tab-and-slot its
    // own joint into the top is a tab, not a dado, so it does not grow
    // upward into the rail's band the way it does under the default dado
    // joint. A rail segment housed in it would silently get no pocket at
    // all - not visible as a warning, just a divider with a groove missing
    // and a rail end left unsupported.
    const divider = find(tabParts, 'C1-B-DIV-1');
    const dividerRailPockets = pockets(divider).filter((f) => f.purpose === 'hanging-rail');
    expect(dividerRailPockets).toHaveLength(2);
    expect(tabWarnings).toEqual([]);
  });
});

describe('wallMountXs', () => {
  it('spaces holes evenly with both ends held in from the tips', () => {
    const xs = wallMountXs(0, 1000, 400);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[xs.length - 1]!).toBeLessThan(1000);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('always drills at least two, so the rail never hangs on a single screw', () => {
    expect(wallMountXs(0, 300, 400).length).toBeGreaterThanOrEqual(2);
  });

  it('still drills at least two on a normal-length rail even with a nonsense spacing', () => {
    // A saved project can carry a zero or negative screwSpacing (normalise.ts
    // merges hangingRail over the template with no clamping). That is a bad
    // value, not an instruction to hang the cabinet on one screw.
    expect(wallMountXs(0, 1000, 0).length).toBeGreaterThanOrEqual(2);
    expect(wallMountXs(0, 1000, -50).length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the centre of a rail too short to hold two spaced holes', () => {
    expect(wallMountXs(5, 5, 400)).toEqual([5]);
  });
});

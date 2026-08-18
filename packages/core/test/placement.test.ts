import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, frameOf, normaliseParams, tessellate } from '../src/index.js';
import type { Axis, Part } from '../src/model/types.js';

/**
 * Where a part's real outline ends up in the assembly.
 *
 * This walks the outline through the part's machining frame, which is exactly
 * what the 3D view and the effects stage do, so it catches any drift between
 * where a panel is supposed to be and where its geometry actually lands.
 */
function outlineExtent(part: Part): { lo: Record<Axis, number>; hi: Record<Axis, number> } {
  const f = frameOf(part);
  const lo: Record<Axis, number> = { x: Infinity, y: Infinity, z: Infinity };
  const hi: Record<Axis, number> = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of tessellate(part.outline, 0.5)) {
    for (const a of ['x', 'y', 'z'] as Axis[]) {
      const face = f.origin[a] + f.u[a] * p.x + f.v[a] * p.y;
      const back = face - f.n[a] * part.thickness;
      lo[a] = Math.min(lo[a], face, back);
      hi[a] = Math.max(hi[a], face, back);
    }
  }
  return { lo, hi };
}

describe('part placement', () => {
  it('lands every dado-jointed panel exactly on its box', () => {
    // The bug this guards against: joinery grows a captured panel's box into
    // its grooves, so anything that re-derives the frame from the enlarged box
    // shifts the whole part by one dado depth, clipping one end and leaving a
    // gap at the other.
    const { parts } = buildProject(defaultParams());
    for (const part of parts) {
      const e = outlineExtent(part);
      for (const a of ['x', 'y', 'z'] as Axis[]) {
        expect(Math.abs(e.lo[a] - part.box.min[a])).toBeLessThan(0.01);
        expect(Math.abs(e.hi[a] - part.box.max[a])).toBeLessThan(0.01);
      }
    }
  });

  it('protrudes tenons symmetrically, by one panel thickness each side', () => {
    const p = defaultParams();
    p.joinery.carcassJoint = 'tabslot';
    const { parts } = buildProject(p);
    const bottom = parts.find((x) => x.id === 'B-BOTTOM')!;
    const side = parts.find((x) => x.id === 'B-SIDE-L')!;
    const e = outlineExtent(bottom);
    expect(bottom.box.min.x - e.lo.x).toBeCloseTo(side.thickness, 6);
    expect(e.hi.x - bottom.box.max.x).toBeCloseTo(side.thickness, 6);
    // Nothing should wander in the other two axes.
    expect(e.lo.y).toBeCloseTo(bottom.box.min.y, 6);
    expect(e.hi.z).toBeCloseTo(bottom.box.max.z, 6);
  });

  it('keeps the frame fixed while joinery grows the box', () => {
    const params = defaultParams();
    const { parts } = buildProject(params);
    const bottom = parts.find((x) => x.id === 'B-BOTTOM')!;
    const side = parts.find((x) => x.id === 'B-SIDE-L')!;
    // The clear opening starts at the side panel's measured thickness, not its
    // nominal one; every dimension here comes off the calipers.
    const clearOpening = side.thickness;
    // The box has grown into its grooves...
    expect(bottom.box.min.x).toBeCloseTo(clearOpening - params.joinery.dadoDepth, 6);
    // ...but the frame origin still sits on the original clear opening, which
    // is what keeps local coordinates meaning the same thing throughout.
    expect(frameOf(bottom).origin.x).toBeCloseTo(clearOpening, 6);
  });

  it('places shelves symmetrically in their bay', () => {
    const params = defaultParams();
    const { parts } = buildProject(params);
    const shelf = parts.find((x) => x.id === 'B-SHELF-2-1')!;
    const divider = parts.find((x) => x.id === 'B-DIV-1')!;
    const right = parts.find((x) => x.id === 'B-SIDE-R')!;
    const e = outlineExtent(shelf);
    const depth = params.joinery.dadoDepth;
    // One dado depth into the divider on the left, and into the side on the right.
    expect(e.lo.x).toBeCloseTo(divider.box.max.x - depth, 6);
    expect(e.hi.x).toBeCloseTo(right.box.min.x + depth, 6);
  });

  it('leaves no gap between a panel and the one it houses into', () => {
    const { parts } = buildProject(defaultParams());
    const left = parts.find((x) => x.id === 'B-SIDE-L')!;
    const bottom = parts.find((x) => x.id === 'B-BOTTOM')!;
    const e = outlineExtent(bottom);
    // The bottom must reach inside the side panel, not stop short of it.
    expect(e.lo.x).toBeLessThan(left.box.max.x);
    expect(e.lo.x).toBeGreaterThan(left.box.min.x);
  });
});

describe('screw holes', () => {
  const params = defaultParams();
  const { parts } = buildProject(params);
  const side = parts.find((p) => p.id === 'B-SIDE-R')!;
  const shelf = parts.find((p) => p.id === 'B-SHELF-2-1')!;
  const screws = side.features.filter((f) => f.kind === 'drill' && f.purpose === 'screw');

  it('drills them through the panel that receives the groove', () => {
    expect(screws.length).toBeGreaterThan(0);
    for (const s of screws) {
      if (s.kind !== 'drill') continue;
      expect(s.depth).toBe('thru');
      expect(s.diameter).toBe(params.joinery.screwClearanceDiameter);
      // Same face as the dado, so the panel is never turned over for them.
      expect(s.side).toBe('A');
    }
  });

  it('puts them on the centreline of the panel they screw into', () => {
    // Nothing to mark out at assembly: the hole is already where the screw goes.
    const centre = (shelf.box.min.z + shelf.box.max.z) / 2;
    const onShelf = screws.filter((s) => s.kind === 'drill' && Math.abs(s.y - centre) < 0.51);
    expect(onShelf.length).toBeGreaterThanOrEqual(2);
  });

  it('sizes the hole to clear the threads, not grip them', () => {
    // A hole sized to the root diameter would have the screw biting in the
    // outer panel and jacking the joint apart.
    expect(params.joinery.screwClearanceDiameter).toBeGreaterThan(4);
  });

  it('can be switched off', () => {
    const p = defaultParams();
    p.joinery.screwHoles = false;
    const off = buildProject(p).parts.find((x) => x.id === 'B-SIDE-R')!;
    expect(off.features.filter((f) => f.kind === 'drill' && f.purpose === 'screw')).toHaveLength(0);
  });
});

describe('opening older project files', () => {
  it('fills in settings that did not exist when the file was saved', () => {
    const old = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    delete old.surfaceEffects;
    (old.joinery as Record<string, unknown>).screwClearanceDiameter = undefined;
    (old.joinery as Record<string, unknown>).screwPilotDiameter = 5;
    const fixed = normaliseParams(old);
    expect(fixed.surfaceEffects).toEqual([]);
    // The old name carries over rather than being silently dropped.
    expect(fixed.joinery.screwClearanceDiameter).toBe(5);
    expect(() => buildProject(fixed)).not.toThrow();
  });

  it('survives a file that is barely a project at all', () => {
    const fixed = normaliseParams({ base: {}, top: {} });
    expect(fixed.materials.length).toBeGreaterThan(0);
    expect(() => buildProject(fixed)).not.toThrow();
  });
});

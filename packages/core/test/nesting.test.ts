import { describe, expect, it } from 'vitest';
import {
  bandIndex,
  bandsFor,
  buildProject,
  defaultParams,
  MaxRectsBin,
  nextBoundary,
  straddles,
  tileCountFor,
  type BandConstraint,
} from '../src/index.js';
import type { CabinetParams, NestStrategy } from '../src/model/types.js';

const withStrategy = (strategy: NestStrategy): CabinetParams => {
  const p = defaultParams();
  p.nesting.strategy = strategy;
  return p;
};

/** Parts cut across a seam that would have fitted inside one tile. */
function avoidableCrossings(project: ReturnType<typeof buildProject>): number {
  const step = project.params.machine.travelX - project.params.machine.tileOverlap;
  let n = 0;
  for (const sheet of project.nest.sheets) {
    for (const part of sheet.parts) {
      if (part.w > step) continue; // no choice, it is bigger than the machine
      if (Math.floor(part.x / step) !== Math.floor((part.x + part.w - 1e-6) / step)) n++;
    }
  }
  return n;
}

const totalSetups = (project: ReturnType<typeof buildProject>): number =>
  project.nest.sheets.reduce((a, s) => a + tileCountFor(project.params, s.contentLength), 0);

describe('band constraint', () => {
  const bands: BandConstraint = { period: 100, phase: 0 };

  it('locates which band a position falls in', () => {
    expect(bandIndex(0, bands)).toBe(0);
    expect(bandIndex(99, bands)).toBe(0);
    expect(bandIndex(100, bands)).toBe(1);
  });

  it('finds the next boundary', () => {
    expect(nextBoundary(0, bands)).toBe(100);
    expect(nextBoundary(150, bands)).toBe(200);
  });

  it('rejects a placement that crosses a seam it could have avoided', () => {
    expect(straddles(90, 30, bands)).toBe(true);
    expect(straddles(10, 30, bands)).toBe(false);
    expect(straddles(100, 100, bands)).toBe(false); // exactly fills a band
  });

  it('allows a part that is simply bigger than a band', () => {
    // Nothing can be done about these, so they must not be blocked.
    expect(straddles(50, 250, bands)).toBe(false);
  });

  it('accounts for the sheet margin offsetting the bin', () => {
    // Seams sit at multiples of the step from the sheet edge, and the bin
    // starts one margin in.
    const offset: BandConstraint = { period: 980, phase: 10 };
    expect(bandIndex(970, offset)).toBe(1); // sheet x = 980, the first seam
    expect(bandIndex(969, offset)).toBe(0);
  });
});

describe('bin packing with bands', () => {
  const bands: BandConstraint = { period: 100, phase: 0 };

  it('keeps every placement inside a single band', () => {
    const bin = new MaxRectsBin(400, 100);
    for (let i = 0; i < 8; i++) bin.insert(60, 24, false, bands);
    for (const p of bin.used) {
      expect(Math.floor(p.x / 100)).toBe(Math.floor((p.x + p.w - 1e-6) / 100));
    }
  });

  it('moves a part into the next band rather than giving up', () => {
    // Free rectangles only start at the edges of placed parts, so without
    // snapping to boundaries the second part here would be refused.
    const bin = new MaxRectsBin(400, 50);
    expect(bin.insert(80, 50, false, bands)).not.toBeNull();
    const second = bin.insert(80, 50, false, bands);
    expect(second).not.toBeNull();
    expect(second!.x).toBe(100); // snapped to the start of band 1
  });

  it('fills the earliest band first', () => {
    const bin = new MaxRectsBin(500, 100);
    for (let i = 0; i < 4; i++) bin.insert(45, 45, false, bands);
    expect(Math.max(...bin.used.map((p) => Math.floor(p.x / 100)))).toBe(0);
  });

  it('still places a part wider than a band', () => {
    const bin = new MaxRectsBin(400, 100);
    expect(bin.insert(250, 50, false, bands)).not.toBeNull();
  });
});

describe('nesting strategies', () => {
  const material = buildProject(withStrategy('material'));
  const tiling = buildProject(withStrategy('tiling'));

  it('cuts nothing across a seam unnecessarily when optimising for setups', () => {
    expect(avoidableCrossings(tiling)).toBe(0);
  });

  it('does let parts fall across seams when optimising for material', () => {
    expect(avoidableCrossings(material)).toBeGreaterThan(0);
  });

  it('needs no more setups than the material-first layout', () => {
    expect(totalSetups(tiling)).toBeLessThanOrEqual(totalSetups(material));
  });

  it('places every part either way', () => {
    expect(tiling.nest.unplaced).toEqual([]);
    expect(material.nest.unplaced).toEqual([]);
  });

  it('does not cost extra sheets on a typical cabinet', () => {
    expect(tiling.nest.sheets.length).toBeLessThanOrEqual(material.nest.sheets.length);
  });

  it('makes no difference when the sheets already fit the machine', () => {
    // With nothing to tile there are no bands, so both strategies agree.
    const fit = (strategy: NestStrategy): number => {
      const p = withStrategy(strategy);
      for (const m of p.materials) {
        m.sheetLength = 1000;
        m.sheetWidth = 1000;
      }
      return buildProject(p).nest.sheets.length;
    };
    expect(fit('tiling')).toBe(fit('material'));
  });

  it('has no bands to honour when tiling is switched off', () => {
    const p = withStrategy('tiling');
    p.machine.tilingAxis = 'none';
    expect(bandsFor(p)).toBeUndefined();
  });
});

describe('setups follow what the sheet actually holds', () => {
  it('counts tiles from the parts, not the blank', () => {
    // A half-filled sheet needs only the setups that reach its parts.
    const project = buildProject(withStrategy('tiling'));
    for (const sheet of project.nest.sheets) {
      expect(sheet.contentLength).toBeLessThanOrEqual(sheet.length + 1e-6);
      const byContent = tileCountFor(project.params, sheet.contentLength);
      const byBlank = tileCountFor(project.params, sheet.length);
      expect(byContent).toBeLessThanOrEqual(byBlank);
    }
  });

  it('reports the reach of the parts in the warning', () => {
    const project = buildProject(withStrategy('tiling'));
    const tiling = project.diagnostics.find((d) => d.message.includes('setups'));
    expect(tiling?.message).toContain('along its length');
  });
});

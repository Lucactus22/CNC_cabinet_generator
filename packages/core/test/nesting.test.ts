import { describe, expect, it } from 'vitest';
import {
  bandIndex,
  bandsFor,
  buildProject,
  checkManufacturability,
  defaultParams,
  GuillotineBin,
  MaxRectsBin,
  nestParts,
  nextBoundary,
  normaliseParams,
  overlaps,
  rect,
  straddles,
  tileCountFor,
  type BandConstraint,
} from '../src/index.js';
import type { Part, ProjectParams, NestStrategy } from '../src/model/types.js';

/** A bare-bones part: only what `nestParts` actually reads. */
function fakePart(id: string, materialId: string, w: number, h: number): Part {
  return {
    id,
    label: id,
    role: 'shelf',
    cabinetId: 'C1',
    carcassId: 'B',
    materialId,
    thickness: 18,
    box: { min: { x: 0, y: 0, z: 0 }, max: { x: w, y: h, z: 18 } },
    normalAxis: 'z',
    faceASign: '+',
    frame: {
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 1, z: 0 },
      n: { x: 0, y: 0, z: 1 },
      origin: { x: 0, y: 0, z: 0 },
    },
    width: w,
    height: h,
    exposed: { x: 0, y: 0, w, h },
    outline: rect(0, 0, w, h),
    features: [],
    grainAxis: 'free',
    bandedEdges: [],
  };
}

/**
 * Whether a set of placed rectangles can be fully separated by a sequence of
 * straight, full-length cuts — the constraint a panel saw actually has.
 *
 * A group of one or none is trivially cuttable. Otherwise some line through a
 * rectangle's own edge, straddling nothing, has to split the group into two
 * non-empty ones that are themselves cuttable the same way.
 */
function isGuillotineCuttable(rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): boolean {
  if (rects.length <= 1) return true;

  const xs = new Set(rects.flatMap((r) => [r.x, r.x + r.w]));
  for (const x of xs) {
    if (rects.some((r) => r.x < x - 1e-6 && r.x + r.w > x + 1e-6)) continue;
    const left = rects.filter((r) => r.x + r.w <= x + 1e-6);
    const right = rects.filter((r) => r.x >= x - 1e-6);
    if (left.length === 0 || right.length === 0) continue;
    if (isGuillotineCuttable(left) && isGuillotineCuttable(right)) return true;
  }

  const ys = new Set(rects.flatMap((r) => [r.y, r.y + r.h]));
  for (const y of ys) {
    if (rects.some((r) => r.y < y - 1e-6 && r.y + r.h > y + 1e-6)) continue;
    const bottom = rects.filter((r) => r.y + r.h <= y + 1e-6);
    const top = rects.filter((r) => r.y >= y - 1e-6);
    if (bottom.length === 0 || top.length === 0) continue;
    if (isGuillotineCuttable(bottom) && isGuillotineCuttable(top)) return true;
  }

  return false;
}

const withStrategy = (strategy: NestStrategy): ProjectParams => {
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

  it('produces sheets a panel saw can actually cut, under guillotine', () => {
    const guillotine = buildProject(withStrategy('guillotine'));
    expect(guillotine.nest.unplaced).toEqual([]);
    for (const sheet of guillotine.nest.sheets) {
      expect(isGuillotineCuttable(sheet.parts)).toBe(true);
    }
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
        m.sheets = [{ length: 1000, width: 1000 }];
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

describe('guillotine bin packing', () => {
  it('only ever leaves layouts a straight-cut sequence can recover', () => {
    const bin = new GuillotineBin(1200, 800);
    const sizes: Array<[number, number]> = [
      [400, 300],
      [400, 300],
      [200, 150],
      [600, 200],
      [150, 700],
      [300, 300],
      [100, 100],
      [250, 400],
    ];
    const placed = sizes.map(([w, h]) => bin.insert(w, h, true)).filter((p) => p !== null);
    // Guillotine splitting wastes more than MaxRects, so not everything that
    // would fit by area necessarily finds a free rectangle — that trade-off
    // is the point. What must always hold is that whatever did get placed
    // could still be freed with a panel saw.
    expect(placed.length).toBeGreaterThan(sizes.length / 2);
    expect(isGuillotineCuttable(placed)).toBe(true);
  });

  it('never reports two free rectangles that overlap', () => {
    const bin = new GuillotineBin(1000, 1000);
    for (const [w, h] of [
      [300, 300],
      [400, 200],
      [150, 600],
      [220, 180],
    ]) {
      bin.insert(w!, h!, false);
    }
    const free = bin.freeRects();
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        expect(overlaps(free[i]!, free[j]!)).toBe(false);
      }
    }
  });

  it('will not place a part that does not fit anywhere left', () => {
    const bin = new GuillotineBin(500, 500);
    expect(bin.insert(600, 100, false)).toBeNull();
  });
});

describe('several sheet sizes on one material', () => {
  const withSizes = (sheets: ProjectParams['materials'][number]['sheets']): ProjectParams => {
    const p = defaultParams();
    p.materials = [{ ...p.materials[0]!, sheets }];
    return p;
  };

  it('nests into a remnant before opening a standard sheet', () => {
    const p = withSizes([
      { length: 700, width: 500, quantity: 1 },
      { length: 2440, width: 1220 },
    ]);
    const materialId = p.materials[0]!.id;
    const parts = [fakePart('a', materialId, 600, 400), fakePart('b', materialId, 600, 400)];

    const result = nestParts(p, parts);

    expect(result.unplaced).toEqual([]);
    expect(result.sheets).toHaveLength(2);
    expect(result.sheets[0]).toMatchObject({ length: 700, width: 500 });
    // The one remnant is spent on the first sheet, so the second part falls
    // back to the standard size rather than a second copy of the remnant.
    expect(result.sheets[1]).toMatchObject({ length: 2440, width: 1220 });
  });

  it('never opens more sheets of a remnant than the quantity on hand', () => {
    const p = withSizes([
      { length: 700, width: 500, quantity: 2 },
      { length: 2440, width: 1220 },
    ]);
    const materialId = p.materials[0]!.id;
    const parts = [1, 2, 3, 4].map((n) => fakePart(`p${n}`, materialId, 600, 400));

    const result = nestParts(p, parts);

    expect(result.unplaced).toEqual([]);
    const remnantSheets = result.sheets.filter((s) => s.length === 700 && s.width === 500);
    expect(remnantSheets).toHaveLength(2);
  });

  it('does not spend a remnant too small for the part on a standard sheet that fits', () => {
    // "Use up the remnant first" only applies once it actually holds the part;
    // otherwise the standard sheet has to be picked or nothing is placed.
    const p = withSizes([
      { length: 500, width: 400, quantity: 5 },
      { length: 2440, width: 1220 },
    ]);
    const materialId = p.materials[0]!.id;

    const result = nestParts(p, [fakePart('big', materialId, 900, 600)]);

    expect(result.unplaced).toEqual([]);
    expect(result.sheets[0]).toMatchObject({ length: 2440, width: 1220 });
  });

  it('leaves a part unplaced when no configured size is big enough', () => {
    const p = withSizes([{ length: 500, width: 400 }]);
    const materialId = p.materials[0]!.id;

    const result = nestParts(p, [fakePart('big', materialId, 900, 600)]);

    expect(result.unplaced).toEqual(['big']);
  });
});

describe('leftover space reported as a remnant', () => {
  it('reports an offcut above the threshold, sized to what is actually left', () => {
    const p = defaultParams();
    p.nesting.remnantThreshold = 300;
    p.materials = [{ ...p.materials[0]!, sheets: [{ length: 1000, width: 1000 }] }];
    const materialId = p.materials[0]!.id;

    const result = nestParts(p, [fakePart('a', materialId, 600, 400)]);

    expect(result.sheets).toHaveLength(1);
    const remnants = result.sheets[0]!.remnants;
    expect(remnants.length).toBeGreaterThan(0);
    for (const r of remnants) {
      expect(Math.min(r.length, r.width)).toBeGreaterThanOrEqual(300);
    }
  });

  it('reports nothing once the threshold exceeds what is left', () => {
    const p = defaultParams();
    p.nesting.remnantThreshold = 5000; // bigger than anything a 1 x 1 m sheet can leave
    p.materials = [{ ...p.materials[0]!, sheets: [{ length: 1000, width: 1000 }] }];
    const materialId = p.materials[0]!.id;

    const result = nestParts(p, [fakePart('a', materialId, 600, 400)]);

    expect(result.sheets[0]!.remnants).toEqual([]);
  });

  it('shows up as an info diagnostic naming the material and the size', () => {
    const p = defaultParams();
    const materialId = p.materials[0]!.id;
    // Built by hand rather than from a real nest, so the diagnostic is
    // checked against a known remnant instead of whatever a cabinet happens
    // to leave over.
    const nest = {
      sheets: [
        {
          index: 0,
          materialId,
          contentLength: 800,
          length: 2440,
          width: 1220,
          parts: [],
          yield: 0.5,
          remnants: [{ length: 640, width: 420 }],
        },
      ],
      unplaced: [],
    };

    const diagnostics = checkManufacturability(p, [], nest, [], []);

    const remnant = diagnostics.find((d) => d.message.includes('remnant worth keeping'));
    expect(remnant).toBeDefined();
    expect(remnant?.severity).toBe('info');
    expect(remnant?.message).toContain(p.materials[0]!.name);
    expect(remnant?.message).toContain('640 x 420');
  });
});

describe('opening a project written before R-11', () => {
  it('reads a single sheetLength/sheetWidth pair as one standard size', () => {
    // Both materials the default project references, in the 0.1 shape: a
    // single sheet size with no notion of several or a quantity.
    const legacy = {
      ...defaultParams(),
      materials: defaultParams().materials.map((m) => {
        const [size] = m.sheets;
        return {
          id: m.id,
          name: m.name,
          nominalThickness: m.nominalThickness,
          actualThickness: m.actualThickness,
          hasGrain: m.hasGrain,
          sheetLength: size!.length,
          sheetWidth: size!.width,
        };
      }),
    };

    const params = normaliseParams(legacy);

    expect(params.materials).toHaveLength(2);
    expect(params.materials[0]!.sheets).toEqual([{ length: 2440, width: 1220 }]);
    // And it still nests: the migration did not just satisfy the type, it
    // carried the number through to the packer.
    expect(() => buildProject(params)).not.toThrow();
  });

  it('leaves a file already on the new shape untouched', () => {
    const params = normaliseParams(defaultParams());
    expect(params.materials[0]!.sheets).toEqual(defaultParams().materials[0]!.sheets);
  });
});

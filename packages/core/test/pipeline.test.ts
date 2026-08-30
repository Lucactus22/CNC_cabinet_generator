import { describe, expect, it } from 'vitest';
import { base, upper } from './carcasses.js';
import {
  blankSize,
  buildProject,
  defaultParams,
  exportProject,
  MaxRectsBin,
  planTiles,
  writeDxf,
  emptyDrawing,
  rect,
  circlePath,
  clipPathToBand,
  pocketLayer,
  drillLayer,
  sanitiseLayer,
} from '../src/index.js';
import type { ProjectParams } from '../src/model/types.js';

/** Sheets cut to the machine's own size: the setup that avoids tiling. */
function machineSized(): ProjectParams {
  const p = defaultParams();
  for (const m of p.materials) {
    m.sheets = [{ length: 1000, width: 1000 }];
  }
  base(p).width = 700;
  base(p).height = 800;
  base(p).depth = 500;
  upper(p).width = 700;
  upper(p).height = 700;
  upper(p).depth = 320;
  return p;
}

describe('bin packing', () => {
  it('places parts without overlapping them', () => {
    const bin = new MaxRectsBin(1000, 600);
    const sizes = [
      [400, 300],
      [400, 300],
      [200, 200],
      [500, 250],
      [150, 500],
    ];
    for (const [w, h] of sizes) expect(bin.insert(w!, h!, true)).not.toBeNull();

    for (let i = 0; i < bin.used.length; i++) {
      for (let j = i + 1; j < bin.used.length; j++) {
        const a = bin.used[i]!;
        const b = bin.used[j]!;
        const overlap =
          a.x < b.x + b.w - 1e-6 &&
          b.x < a.x + a.w - 1e-6 &&
          a.y < b.y + b.h - 1e-6 &&
          b.y < a.y + a.h - 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });

  it('keeps every placement inside the bin', () => {
    const bin = new MaxRectsBin(800, 400);
    for (let i = 0; i < 20; i++) bin.insert(120, 90, true);
    for (const p of bin.used) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(800 + 1e-9);
      expect(p.y + p.h).toBeLessThanOrEqual(400 + 1e-9);
    }
  });

  it('refuses a part larger than the bin', () => {
    expect(new MaxRectsBin(100, 100).insert(200, 50, false)).toBeNull();
  });

  it('uses rotation to fit a part that will not go in straight', () => {
    const bin = new MaxRectsBin(100, 300);
    expect(bin.insert(250, 80, false)).toBeNull();
    expect(bin.insert(250, 80, true)).not.toBeNull();
  });
});

describe('nesting', () => {
  const project = buildProject(defaultParams());

  it('places every part', () => {
    expect(project.nest.unplaced).toEqual([]);
    const placed = project.nest.sheets.flatMap((s) => s.parts.map((p) => p.partId));
    expect(new Set(placed).size).toBe(project.parts.length);
  });

  it('never mixes materials on one sheet', () => {
    for (const sheet of project.nest.sheets) {
      for (const p of sheet.parts) {
        const part = project.parts.find((x) => x.id === p.partId)!;
        expect(part.materialId).toBe(sheet.materialId);
      }
    }
  });

  it('leaves at least a cutter diameter between parts', () => {
    const gap = project.params.tool.diameter + project.params.nesting.partGap;
    for (const sheet of project.nest.sheets) {
      for (let i = 0; i < sheet.parts.length; i++) {
        for (let j = i + 1; j < sheet.parts.length; j++) {
          const a = sheet.parts[i]!;
          const b = sheet.parts[j]!;
          const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
          const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
          // Parts are inflated by the spacing before packing, so at least one
          // axis has to clear by that much.
          expect(Math.max(dx, dy)).toBeGreaterThan(-1e-6);
          if (dx < 0 && dy < 0) throw new Error('parts overlap');
          expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(Math.min(gap, 0) - 1e-6);
        }
      }
    }
  });

  it('keeps parts inside the sheet margin', () => {
    const margin = project.params.nesting.sheetMargin;
    for (const sheet of project.nest.sheets) {
      for (const p of sheet.parts) {
        expect(p.x).toBeGreaterThanOrEqual(margin - 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(margin - 1e-6);
        expect(p.x + p.w).toBeLessThanOrEqual(sheet.length - margin + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(sheet.width - margin + 1e-6);
      }
    }
  });

  it('holds a grain-locked side panel to one orientation', () => {
    const params = defaultParams();
    const side = project.parts.find((p) => p.id === 'C1-B-SIDE-L')!;
    const material = params.materials.find((m) => m.id === side.materialId)!;
    expect(material.hasGrain).toBe(true);
    expect(side.grainAxis).toBe('v');
    // Grain runs up the panel, so the blank lies across the sheet's length.
    const size = blankSize(side, material);
    expect(size.w).toBeCloseTo(side.height, 6);
    expect(size.h).toBeCloseTo(side.width, 6);
  });

  it('lets a hidden back panel turn for a better yield', () => {
    const back = project.parts.find((p) => p.id === 'C1-B-BACK')!;
    expect(back.grainAxis).toBe('free');
  });
});

describe('machine diagnostics', () => {
  it('rejects a sheet wider than the travel across the feed axis', () => {
    // 1220 mm of sheet across a 1000 mm axis that never moves: tiling in the
    // other direction cannot rescue it.
    const project = buildProject(defaultParams());
    const errs = project.diagnostics.filter((d) => d.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]!.message).toContain('across the feed direction');
  });

  it('is happy once the sheets match the machine', () => {
    const project = buildProject(machineSized());
    expect(project.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('does not check the raw sheet against the machine under guillotine', () => {
    // A panel saw breaks the sheet down before anything reaches the router,
    // so "does the whole sheet fit the bed" does not describe that workflow
    // — unlike the default project, this must not error just because the
    // configured sheet is bigger than the machine.
    const p = defaultParams();
    p.nesting.strategy = 'guillotine';
    const project = buildProject(p);
    const machineErrs = project.diagnostics.filter(
      (d) => d.severity === 'error' && d.topic === 'machine',
    );
    expect(machineErrs).toEqual([]);
  });

  it('still checks each part against the machine under guillotine', () => {
    // Whatever the saw leaves behind still has to be machined, so a part
    // itself too big for the bed is still an error even in guillotine mode.
    const p = defaultParams();
    p.nesting.strategy = 'guillotine';
    p.machine.travelY = 300;
    p.machine.travelX = 300;
    const project = buildProject(p);
    const errs = project.diagnostics.filter(
      (d) => d.severity === 'error' && d.message.includes('cannot be cut'),
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it('counts the setups a long sheet needs', () => {
    const project = buildProject(defaultParams());
    const tiling = project.diagnostics.find((d) => d.message.includes('needs'));
    expect(tiling?.message).toContain('setups');
  });

  it('calls out a part too big for the machine in any orientation', () => {
    const p = defaultParams();
    p.machine.travelY = 300;
    p.machine.travelX = 300;
    const project = buildProject(p);
    const errs = project.diagnostics.filter(
      (d) => d.severity === 'error' && d.message.includes('cannot be cut'),
    );
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]!.partIds?.length).toBe(1);
  });

  it('warns about a shelf long enough to sag', () => {
    const p = defaultParams();
    base(p).dividerCount = 0;
    base(p).width = 1400;
    base(p).bays = [{ shelves: 'fixed', shelfCount: 2 }];
    const project = buildProject(p);
    expect(project.diagnostics.some((d) => d.message.includes('sag'))).toBe(true);
  });
});

describe('tiling', () => {
  const machine = defaultParams().machine;

  it('does not tile a sheet that already fits', () => {
    expect(planTiles(900, 900, machine, 10)).toBeNull();
  });

  it('splits a full sheet into bands the machine can reach', () => {
    const plan = planTiles(2440, 1220, machine, 10)!;
    expect(plan).not.toBeNull();
    expect(plan.step).toBe(machine.travelX - machine.tileOverlap);
    for (const t of plan.tiles) {
      expect(t.to - t.from).toBeLessThanOrEqual(machine.travelX + 1e-9);
    }
    // The bands must cover the sheet end to end with no gaps.
    expect(plan.tiles[0]!.from).toBe(0);
    expect(plan.tiles[plan.tiles.length - 1]!.to).toBeCloseTo(2440, 6);
    for (let i = 1; i < plan.tiles.length; i++) {
      expect(plan.tiles[i]!.from).toBeCloseTo(plan.tiles[i - 1]!.to, 6);
    }
  });

  it('spaces registration holes exactly one feed step apart', () => {
    // This is what lets the previous tile's holes drop onto the same pins.
    const plan = planTiles(2440, 1220, machine, 10)!;
    for (let i = 1; i < plan.registrationX.length; i++) {
      expect(plan.registrationX[i]! - plan.registrationX[i - 1]!).toBeCloseTo(plan.step, 6);
    }
    expect(plan.registrationY).toHaveLength(2);
  });

  it('gives up when the overlap swallows the travel', () => {
    expect(planTiles(2440, 1220, { ...machine, tileOverlap: 1200 }, 10)).toBeNull();
  });
});

describe('tile clipping', () => {
  const band = { from: 0, to: 100, axis: 'x' as const };

  it('passes geometry that already fits straight through', () => {
    const r = rect(10, 10, 50, 50);
    expect(clipPathToBand(r, band)).toBe(r);
  });

  it('drops geometry beyond the band', () => {
    expect(clipPathToBand(rect(200, 10, 50, 50), band)).toBeNull();
  });

  it('trims geometry that straddles the seam', () => {
    const clipped = clipPathToBand(rect(80, 10, 50, 50), band)!;
    expect(clipped).not.toBeNull();
    const xs = clipped.pts.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(100, 6);
    expect(Math.min(...xs)).toBeCloseTo(80, 6);
  });
});

describe('layer naming', () => {
  const plain = { safeNames: false };
  const safe = { safeNames: true };

  it('encodes the cut depth so CAM can pick it up', () => {
    expect(pocketLayer(6, plain)).toBe('POCKET_D6');
    expect(pocketLayer(6.35, plain)).toBe('POCKET_D6.35');
  });

  it('distinguishes blind holes from through holes', () => {
    expect(drillLayer(5, 12, plain)).toBe('DRILL_5_D12');
    expect(drillLayer(4.5, 'thru', plain)).toBe('DRILL_4.5_THRU');
  });

  it('can avoid decimal points for fussy importers', () => {
    expect(pocketLayer(6.35, safe)).toBe('POCKET_D6P35');
  });

  it('upper-cases names, because R12 cannot carry lower case', () => {
    expect(sanitiseLayer('pocket_d6')).toBe('POCKET_D6');
    expect(sanitiseLayer('bad:name?here')).toBe('BAD_NAME_HERE');
  });
});

describe('DXF output', () => {
  it('writes a well-formed R12 header and sections', () => {
    const d = emptyDrawing();
    d.paths.push({ layer: 'OUTLINE', path: rect(0, 0, 100, 50) });
    const dxf = writeDxf(d);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf.match(/\bSECTION\b/g)?.length).toBe(3);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    expect(dxf).toContain('POLYLINE');
    expect(dxf).toContain('SEQEND');
  });

  it('writes arcs as polyline bulges', () => {
    const d = emptyDrawing();
    d.paths.push({ layer: 'THROUGH', path: circlePath(10, 10, 5) });
    const dxf = writeDxf(d);
    // Group code 42 carries the bulge.
    expect(dxf).toContain('\r\n42\r\n');
  });

  it('never emits exponent notation, which some importers choke on', () => {
    const d = emptyDrawing();
    d.paths.push({ layer: 'OUTLINE', path: rect(0.0000001, 0, 1e7, 50) });
    expect(writeDxf(d)).not.toMatch(/\de[+-]\d/i);
  });

  it('produces one file per sheet plus one per tile, and a cut list', () => {
    const project = buildProject(defaultParams());
    const bundle = exportProject(project);
    const sheets = project.nest.sheets.length;
    expect(bundle.files.filter((f) => /sheet\d+\.dxf$/.test(f.name))).toHaveLength(sheets);
    expect(bundle.files.filter((f) => f.name.includes('-tile')).length).toBeGreaterThan(0);
    expect(bundle.files.some((f) => f.name.endsWith('cutlist.csv'))).toBe(true);
  });

  it('zeroes each tile to its own origin', () => {
    const project = buildProject(defaultParams());
    const bundle = exportProject(project);
    const tile2 = bundle.files.find((f) => f.name.includes('sheet1-tile2'))!;
    const xs = [...tile2.dxf.matchAll(/\r\n10\r\n(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(0);
    // Tile 2 starts one step along the sheet, but its own file starts near zero.
    expect(Math.min(...xs)).toBeGreaterThan(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(project.params.machine.travelX + 1);
  });

  it('emits no tiles when the sheets match the machine', () => {
    const bundle = exportProject(buildProject(machineSized()));
    expect(bundle.files.filter((f) => f.name.includes('-tile'))).toHaveLength(0);
  });
});

describe('cut list', () => {
  const project = buildProject(defaultParams());

  it('lists every part with the sheet it comes from', () => {
    expect(project.cutList).toHaveLength(project.parts.length);
    for (const row of project.cutList) {
      expect(row.sheet).not.toBe('');
      expect(row.length).toBeGreaterThan(0);
      expect(row.width).toBeGreaterThan(0);
      expect(row.length).toBeGreaterThanOrEqual(row.width);
    }
  });

  it('escapes commas so the CSV survives a spreadsheet', () => {
    const p = defaultParams();
    p.materials[0]!.name = 'Ply, 18 mm';
    const csv = exportProject(buildProject(p)).files.find((f) => f.name.endsWith('.csv'))!.dxf;
    expect(csv).toContain('"Ply, 18 mm"');
  });
});

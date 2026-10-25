import { describe, expect, it } from 'vitest';
import {
  buildProject,
  defaultParams,
  exportProject,
  exportSheet,
  machiningReach,
  planTiles,
  tileCountFor,
  type NestedSheet,
  type ProjectParams,
} from '../src/index.js';

/**
 * These assert the properties that make feed-through tiling actually work at
 * the machine, rather than just producing plausible-looking files.
 */

interface Circle {
  layer: string;
  x: number;
  y: number;
}

interface Polyline {
  layer: string;
  closed: boolean;
  pts: Array<{ x: number; y: number; bulge: number }>;
}

/** Pull entities back out of written DXF, so the checks read the real output. */
function parse(dxf: string): {
  polylines: Polyline[];
  circles: Circle[];
} {
  const lines = dxf.split(/\r\n/);
  const polylines: Polyline[] = [];
  const circles: Circle[] = [];
  let i = 0;
  let current: Polyline | null = null;

  const pairsUntilNextEntity = (): Map<number, string> => {
    const m = new Map<number, string>();
    while (i + 1 < lines.length) {
      const code = Number(lines[i]);
      if (code === 0) break;
      m.set(code, lines[i + 1]!);
      i += 2;
    }
    return m;
  };

  while (i < lines.length) {
    if (Number(lines[i]) !== 0) {
      i += 2;
      continue;
    }
    const type = lines[i + 1];
    i += 2;
    const p = pairsUntilNextEntity();
    if (type === 'POLYLINE') {
      current = { layer: p.get(8) ?? '0', closed: (Number(p.get(70)) & 1) === 1, pts: [] };
      polylines.push(current);
    } else if (type === 'VERTEX' && current) {
      current.pts.push({
        x: Number(p.get(10)),
        y: Number(p.get(20)),
        bulge: Number(p.get(42) ?? 0),
      });
    } else if (type === 'SEQEND') {
      current = null;
    } else if (type === 'CIRCLE') {
      circles.push({ layer: p.get(8) ?? '0', x: Number(p.get(10)), y: Number(p.get(20)) });
    }
  }
  return { polylines, circles };
}

describe('feed-through tiling', () => {
  const params = defaultParams(); // 2440 x 1220 sheets on a 1 x 1 m machine
  const project = buildProject(params);
  const bundle = exportProject(project);
  const step = params.machine.travelX - params.machine.tileOverlap;

  const sheet = project.nest.sheets[0]!;
  const whole = parse(bundle.files.find((f) => f.name.endsWith('sheet1.dxf'))!.dxf);
  const tiles = bundle.files
    .filter((f) => /sheet1-tile\d+\.dxf$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => parse(f.dxf));

  it('splits the sheet into more than one tile', () => {
    expect(tiles.length).toBe(
      planTiles(sheet.length, sheet.width, params.machine, params.nesting.sheetMargin)!.tiles
        .length,
    );
    expect(tiles.length).toBeGreaterThan(1);
  });

  it('keeps every tile inside the machine envelope', () => {
    for (const tile of tiles) {
      const xs = [
        ...tile.polylines.flatMap((p) => p.pts.map((q) => q.x)),
        ...tile.circles.map((c) => c.x),
      ];
      if (xs.length === 0) continue;
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...xs)).toBeLessThanOrEqual(params.machine.travelX + 1e-6);
    }
  });

  it('leaves the registration pins in fixed positions', () => {
    // The pins stay put and the stock moves. Every tile's holes must therefore
    // land at local X of either 0 or one step.
    for (const tile of tiles) {
      const reg = tile.circles.filter((c) => c.layer === 'TILE_REG');
      for (const c of reg) {
        const onPin = Math.abs(c.x) < 0.01 || Math.abs(c.x - step) < 0.01;
        expect(onPin).toBe(true);
      }
    }
  });

  it('uses the same two Y positions on every tile', () => {
    const ys = new Set<number>();
    for (const tile of tiles) {
      for (const c of tile.circles.filter((x) => x.layer === 'TILE_REG'))
        ys.add(Math.round(c.y * 100));
    }
    expect(ys.size).toBe(2);
  });

  it('pins each seam from both sides', () => {
    // A seam hole is drilled by one tile and reused as a pin by the next, so it
    // has to appear in both.
    const counts = new Map<number, number>();
    tiles.forEach((tile, i) => {
      for (const c of tile.circles.filter((x) => x.layer === 'TILE_REG')) {
        const sheetX = Math.round((i * step + c.x) * 10);
        counts.set(sheetX, (counts.get(sheetX) ?? 0) + 1);
      }
    });
    expect(counts.size).toBe(tiles.length - 1);
    // Two holes, seen by two adjacent tiles.
    for (const n of counts.values()) expect(n).toBe(4);
  });

  it('adds no cut across a part where it meets a seam', () => {
    // A tile's share of a profile is the stretch of the cutter's path inside
    // it. Closing that stretch along the seam, the way a pocket is closed,
    // would be a full-depth cut straight across the part: a side panel longer
    // than one tile would come off the machine in two pieces. So the tiles,
    // put back together, must cut exactly the length of profile the whole
    // sheet does, and not a millimetre more.
    const profileLength = (p: Polyline): number => {
      let total = 0;
      const n = p.pts.length;
      const segs = p.closed ? n : n - 1;
      for (let k = 0; k < segs; k++) {
        const a = p.pts[k]!;
        const b = p.pts[(k + 1) % n]!;
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        // An arc is longer than its chord: θ/2 over sin(θ/2), with θ = 4·atan(bulge).
        const half = 2 * Math.atan(Math.abs(a.bulge));
        total += half < 1e-9 ? chord : (chord * half) / Math.sin(half);
      }
      return total;
    };
    const isOutline = (p: Polyline): boolean => p.layer === 'OUTLINE' || p.layer === 'OUTLINE_OPEN';
    const onSheet = whole.polylines.filter(isOutline).reduce((a, p) => a + profileLength(p), 0);
    const onTiles = tiles
      .flatMap((t) => t.polylines.filter(isOutline))
      .reduce((a, p) => a + profileLength(p), 0);
    // Tessellating a straddling contour's corner reliefs moves its length by
    // a sagitta's worth, far under the 400 mm a closed seam would add.
    expect(Math.abs(onTiles - onSheet)).toBeLessThan(1);
  });

  it('leaves a straddling profile open at the seam, on a layer of its own', () => {
    // C1-T-SIDE-L, 1100 mm long, sits across the first seam on the default sheet.
    const sheetOutlines = whole.polylines.filter((p) => p.layer === 'OUTLINE');
    let straddlers = 0;
    for (const o of sheetOutlines) {
      const xs = o.pts.map((p) => p.x);
      for (let b = 1; b < tiles.length; b++) {
        if (Math.min(...xs) < b * step && b * step < Math.max(...xs)) straddlers++;
      }
    }
    expect(straddlers).toBeGreaterThan(0);

    for (const [i, tile] of tiles.entries()) {
      for (const p of tile.polylines.filter((q) => q.layer === 'OUTLINE')) {
        // Whatever stays on OUTLINE is a whole part, closed, as it was on the sheet.
        expect(p.closed).toBe(true);
      }
      for (const p of tile.polylines.filter((q) => q.layer === 'OUTLINE_OPEN')) {
        expect(p.closed).toBe(false);
        const ends = [p.pts[0]!, p.pts[p.pts.length - 1]!];
        // It stops at a seam, at this tile's own edge, and nowhere else.
        for (const e of ends) {
          const atSeam =
            (i > 0 && Math.abs(e.x) < 1e-6) ||
            (i < tiles.length - 1 && Math.abs(e.x - step) < 1e-6);
          expect(atSeam).toBe(true);
        }
        // And never runs along it.
        for (let k = 0; k + 1 < p.pts.length; k++) {
          const a = p.pts[k]!;
          const b = p.pts[k + 1]!;
          const alongSeam =
            Math.abs(a.x - b.x) < 1e-6 && (Math.abs(a.x) < 1e-6 || Math.abs(a.x - step) < 1e-6);
          expect(alongSeam).toBe(false);
        }
      }
    }
  });

  it('carries a groove crossing a seam a cutter width into the next tile, leaving no rib', () => {
    // Each tile's share of a pocket is closed along the band's edge, and CAM
    // keeps the cutter a radius inside it: two shares meeting exactly at the
    // seam left a rib one cutter wide across the back groove of every long
    // side panel. The tile before a seam now reaches a cutter's width past it.
    const d = params.tool.diameter;
    const pockets = tiles[0]!.polylines.filter((p) => p.layer.startsWith('POCKET'));
    const reach = Math.max(...pockets.flatMap((p) => p.pts.map((q) => q.x)));
    expect(reach).toBeCloseTo(step + d, 6);
    // …and the next tile's share starts at the seam, so the two overlap by a
    // cutter's width: the cutter stopping a radius short on each side still
    // meets in the middle.
    const next = tiles[1]!.polylines.filter((p) => p.layer.startsWith('POCKET'));
    expect(Math.min(...next.flatMap((p) => p.pts.map((q) => q.x)))).toBeCloseTo(0, 6);
  });

  it('says when the tile overlap is too narrow to reach past a seam with the cutter', () => {
    const narrow = defaultParams();
    narrow.machine.tileOverlap = 4;
    const warned = exportProject(buildProject(narrow)).warnings.find((w) =>
      w.includes('a rib 2.0 mm wide is left across the groove'),
    );
    expect(warned).toContain('set the tile overlap to at least');
  });

  it('says which parts cross a seam, and which side of the open profile to cut', () => {
    const tiling = bundle.warnings.find((w) => w.includes('OUTLINE_OPEN'));
    expect(tiling).toContain('C1-T-SIDE-L');
    expect(tiling).toContain('right of the direction of travel');
  });

  it('carries every drilled hole through to exactly one tile', () => {
    const key = (layer: string, x: number, y: number): string =>
      `${layer}@${x.toFixed(1)},${y.toFixed(1)}`;
    const onSheet = whole.circles
      .filter((c) => c.layer !== 'TILE_REG')
      .map((c) => key(c.layer, c.x, c.y))
      .sort();
    const onTiles = tiles
      .flatMap((t, i) =>
        t.circles
          .filter((c) => c.layer !== 'TILE_REG')
          .map((c) => key(c.layer, c.x + i * step, c.y)),
      )
      .sort();
    expect(onTiles).toEqual(onSheet);
  });

  it('places registration holes in the waste margin, clear of the parts', () => {
    for (const tile of tiles) {
      for (const c of tile.circles.filter((x) => x.layer === 'TILE_REG')) {
        const inMargin =
          c.y <= params.nesting.sheetMargin || c.y >= sheet.width - params.nesting.sheetMargin;
        expect(inMargin).toBe(true);
      }
    }
  });
});

describe('a tiled sheet that is turned over partway', () => {
  /** Count entities on a layer matching `re` in written DXF. */
  const onLayers = (dxf: string, re: RegExp): number => {
    const lines = dxf.split(/\r\n/);
    let n = 0;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      if (lines[i] === '8' && re.test(lines[i + 1]!) && lines[i + 1] !== 'TILE_REG_FLIP') n++;
    }
    // Each POLYLINE repeats its layer on every VERTEX and on SEQEND; counting
    // layer tags rather than entities is fine for a like-for-like comparison.
    return n;
  };

  // The divider with shelf housings on both faces, nested on its own at the
  // start of an otherwise empty sheet: the commonest way a last sheet ends up.
  const project = buildProject(defaultParams());
  const home = project.nest.sheets.find((s) => s.parts.some((p) => p.partId === 'C1-T-DIV-1'))!;
  const placed = home.parts.find((p) => p.partId === 'C1-T-DIV-1')!;
  const margin = project.params.nesting.sheetMargin;
  const alone: NestedSheet = {
    ...home,
    parts: [{ ...placed, x: margin, y: margin }],
    contentLength: margin + placed.w,
  };
  const out = exportSheet(project.params, project.parts, alone);

  it('tiles as far as the second face reaches, not only the first', () => {
    // Turned over left to right, a part at the start of the blank is at its
    // far end, beyond everything the first face needed tiling for.
    const reach = machiningReach(alone, project.parts);
    expect(reach).toBeCloseTo(alone.length - margin, 6);
    expect(reach).toBeGreaterThan(alone.contentLength + 1000);
    expect(out.plan!.tiles[out.plan!.tiles.length - 1]!.to).toBeCloseTo(reach, 6);
  });

  it('loses none of the second-face work from the tile files', () => {
    // The housings and pin holes on the divider's second face. Missing from
    // the tiles, they would be cut from the full sheet's file only — or, by
    // anyone cutting from tiles, not at all.
    const full = onLayers(out.full.dxf, /_FLIP$/);
    expect(full).toBeGreaterThan(0);
    const tiled = out.tiles.reduce((a, t) => a + onLayers(t.dxf, /_FLIP$/), 0);
    expect(tiled).toBe(full);
  });

  it('pins the second pass on holes of its own', () => {
    for (const tile of out.tiles) {
      const parsed = parse(tile.dxf);
      const first = parsed.circles.filter((c) => c.layer === 'TILE_REG');
      const second = parsed.circles.filter((c) => c.layer === 'TILE_REG_FLIP');
      expect(second.map((c) => [c.x, c.y])).toEqual(first.map((c) => [c.x, c.y]));
    }
    expect(out.warnings.join(' ')).toContain('go through the tiles again from tile 1');
  });

  it('counts the same setups in the diagnostics as the export cuts', () => {
    // The warning that says how many setups a sheet needs and the files that
    // arrive have to agree, or the operator stops one tile short.
    expect(tileCountFor(project.params, machiningReach(alone, project.parts))).toBe(
      out.tiles.length,
    );
    for (const params of [defaultParams(), withAdjustableShelves()]) {
      const p = buildProject(params);
      const files = exportProject(p).files;
      for (const sheet of p.nest.sheets) {
        const tileFiles = files.filter((f) =>
          new RegExp(`-sheet${sheet.index + 1}-tile\\d+\\.dxf$`).test(f.name),
        ).length;
        const said = p.diagnostics.find(
          (d) =>
            d.spatial?.kind === 'sheet-tiles' && d.message.startsWith(`Sheet ${sheet.index + 1} `),
        );
        expect(said?.spatial?.kind === 'sheet-tiles' ? said.spatial.tiles : 0).toBe(tileFiles);
      }
    }
  });
});

describe('the setups a turned-over tiled sheet needs', () => {
  it('counts both faces, since the tiles are worked once a face', () => {
    const p = buildProject(defaultParams());
    const turnedSheet = p.nest.sheets.find((s) => s.parts.some((q) => q.partId === 'C1-T-DIV-1'))!;
    const said = p.diagnostics.find((d) =>
      d.message.startsWith(`Sheet ${turnedSheet.index + 1} has parts reaching`),
    );
    const found = /needs (\d+) setups on each face, (\d+) in all/.exec(said?.message ?? '');
    expect(found).not.toBeNull();
    expect(Number(found![2])).toBe(Number(found![1]) * 2);
  });
});

describe('the turn-over instruction', () => {
  it('is given for a sheet whose only second-face work is drilling', () => {
    // Adjustable shelves in every bay put shelf-pin rows on both faces of the
    // dividers and no grooves at all: nothing on a _FLIP polyline layer, and
    // the sheet still has to be turned over for 34 holes.
    const p = buildProject(withAdjustableShelves());
    const bundle = exportProject(p);
    const sheets = bundle.files.filter((f) => /-sheet\d+\.dxf$/.test(f.name));
    let drillOnly = 0;
    for (const f of sheets) {
      const parsed = parse(f.dxf);
      const flipPaths = parsed.polylines.filter((q) => q.layer.endsWith('_FLIP')).length;
      const flipHoles = parsed.circles.filter((c) => c.layer.endsWith('_FLIP')).length;
      if (flipHoles === 0) continue;
      if (flipPaths === 0) drillOnly++;
      const n = /-sheet(\d+)\.dxf$/.exec(f.name)![1];
      expect(
        bundle.warnings.some((w) => w.startsWith(`Sheet ${n} has features on both faces`)),
      ).toBe(true);
    }
    expect(drillOnly).toBeGreaterThan(0);
  });
});

function withAdjustableShelves(): ProjectParams {
  const p = defaultParams();
  for (const cab of p.cabinets) {
    for (const c of cab.carcasses) {
      for (const b of c.bays) {
        b.shelves = 'adjustable';
        b.shelfCount = Math.max(b.shelfCount, 1);
      }
    }
  }
  return p;
}

describe('a hole on a tile seam', () => {
  // The default design with its sheets ripped to the machine's 1000 mm — the
  // first fix the app offers — puts two of C1-T-SIDE-R's shelf-pin holes
  // exactly across the second seam of sheet 3.
  const params = defaultParams();
  for (const m of params.materials) for (const s of m.sheets) s.width = Math.min(s.width, 1000);
  const bundle = exportProject(buildProject(params));
  const said = bundle.warnings.filter((w) => w.includes('left out of the tile files'));

  it('is named — sheet, tile, part, layer and where — so it can be drilled by hand', () => {
    expect(said.length).toBeGreaterThan(0);
    const first = said[0]!;
    expect(first).toMatch(/^Sheet \d+, tile \d+: /);
    expect(first).toContain('C1-T-SIDE-R');
    expect(first).toContain('DRILL_5_D12');
    expect(first).toMatch(/at \(\d+, \d+\)/);
  });

  it('is said once, though both tiles beside the seam leave it out', () => {
    expect(new Set(said).size).toBe(said.length);
    const holes = said.flatMap((w) => [...w.matchAll(/\((\d+), (\d+)\)/g)].map((m) => m[0]));
    expect(new Set(holes).size).toBe(holes.length);
  });

  it('travels with the files, in the instructions written into the zip', () => {
    const txt = bundle.files.find((f) => f.name.endsWith('-before-you-cut.txt'))!;
    for (const w of said) expect(txt.dxf).toContain(w);
  });
});

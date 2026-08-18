import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, exportProject, planTiles } from '../src/index.js';

/**
 * These assert the properties that make feed-through tiling actually work at
 * the machine, rather than just producing plausible-looking files.
 */

interface Circle {
  layer: string;
  x: number;
  y: number;
}

/** Pull entities back out of written DXF, so the checks read the real output. */
function parse(dxf: string): { polylines: Array<{ layer: string; pts: Array<{ x: number; y: number }> }>; circles: Circle[] } {
  const lines = dxf.split(/\r\n/);
  const polylines: Array<{ layer: string; pts: Array<{ x: number; y: number }> }> = [];
  const circles: Circle[] = [];
  let i = 0;
  let current: { layer: string; pts: Array<{ x: number; y: number }> } | null = null;

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
      current = { layer: p.get(8) ?? '0', pts: [] };
      polylines.push(current);
    } else if (type === 'VERTEX' && current) {
      current.pts.push({ x: Number(p.get(10)), y: Number(p.get(20)) });
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
    expect(tiles.length).toBe(planTiles(sheet.length, sheet.width, params.machine, params.nesting.sheetMargin)!.tiles.length);
    expect(tiles.length).toBeGreaterThan(1);
  });

  it('keeps every tile inside the machine envelope', () => {
    for (const tile of tiles) {
      const xs = [...tile.polylines.flatMap((p) => p.pts.map((q) => q.x)), ...tile.circles.map((c) => c.x)];
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
      for (const c of tile.circles.filter((x) => x.layer === 'TILE_REG')) ys.add(Math.round(c.y * 100));
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

  it('splits parts across seams without losing or duplicating any', () => {
    const sheetOutlines = whole.polylines.filter((p) => p.layer === 'OUTLINE');
    const tilePieces = tiles.reduce(
      (a, t) => a + t.polylines.filter((p) => p.layer === 'OUTLINE').length,
      0,
    );
    let straddlers = 0;
    for (const o of sheetOutlines) {
      const xs = o.pts.map((p) => p.x);
      for (let b = 1; b < tiles.length; b++) {
        if (Math.min(...xs) < b * step && b * step < Math.max(...xs)) straddlers++;
      }
    }
    // Each part crossing a seam becomes one extra piece, and nothing else changes.
    expect(tilePieces).toBe(sheetOutlines.length + straddlers);
  });

  it('carries every drilled hole through to exactly one tile', () => {
    const key = (layer: string, x: number, y: number): string =>
      `${layer}@${x.toFixed(1)},${y.toFixed(1)}`;
    const onSheet = whole.circles.filter((c) => c.layer !== 'TILE_REG').map((c) => key(c.layer, c.x, c.y)).sort();
    const onTiles = tiles
      .flatMap((t, i) =>
        t.circles.filter((c) => c.layer !== 'TILE_REG').map((c) => key(c.layer, c.x + i * step, c.y)),
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

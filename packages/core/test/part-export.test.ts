import { describe, expect, it } from 'vitest';
import {
  applyToPath,
  bboxOf,
  buildProject,
  composeSheet,
  defaultParams,
  exportPart,
  FLIP_SUFFIX,
  partDrawing,
  partsNeedingFlip,
  partTransform,
  pocketLayer,
  type Part,
  type PocketFeature,
  type ThroughFeature,
} from '../src/index.js';

const find = (parts: Part[], id: string): Part => {
  const part = parts.find((p) => p.id === id);
  if (!part) throw new Error(`No part '${id}'`);
  return part;
};

const pocketsOn = (p: Part, side: 'A' | 'B'): PocketFeature[] =>
  p.features.filter((f): f is PocketFeature => f.kind === 'pocket' && f.side === side);

/**
 * R-22: "any single part re-exportable on its own" — the answer to the
 * workshop's most common accident, a ruined panel, without opening the whole
 * sheet zip in another program to find and cut the one blank back out again.
 *
 * `joinery.test.ts` already establishes 'C1-B-SIDE-L' as a plain side (never
 * needs turning) and 'C1-T-DIV-1' as the divider shelved on both sides that
 * does — DXF.md's own example of a part carrying `_FLIP` layers. Reusing
 * those two real parts, rather than a hand-built one, is what proves this
 * matches the geometry the sheet export actually cuts, not a stand-in for it.
 */
describe('a part exported on its own', () => {
  const project = buildProject(defaultParams());
  const plain = find(project.parts, 'C1-B-SIDE-L');
  const flipped = find(project.parts, 'C1-T-DIV-1');

  it('draws the outline and every feature untouched when nothing needs turning', () => {
    expect(partsNeedingFlip([plain])).toHaveLength(0);
    const d = partDrawing(plain, { safeNames: false }, false);
    // The blank's own local frame, not a sheet placement: identical by value
    // to the part's own outline, not merely the same shape moved somewhere.
    expect(d.paths[0]).toEqual({ layer: 'OUTLINE', path: plain.outline });
    const pockets = plain.features.filter((f): f is PocketFeature => f.kind === 'pocket');
    expect(pockets.length).toBeGreaterThan(0);
    for (const f of pockets) {
      // Same array reference: nothing was rebuilt or moved for a part that
      // never has to be turned over.
      expect(d.paths.some((p) => p.path === f.path)).toBe(true);
    }
  });

  it('agrees with composeSheet exactly for a part that never needs turning', () => {
    // partDrawing is not composeSheet reused — see part.ts's own doc comment
    // for why a flipped feature genuinely cannot agree between the two (one
    // turns a sheet over, the other turns one loose blank over, and those
    // are different axes in general). For a part with nothing on face B,
    // though, there is only one physical operation either way, and the two
    // functions have to land on the identical geometry once placed on the
    // sheet — this is what stops a future change to one of them drifting
    // silently away from the other for the common, unflipped case.
    const sheet = project.nest.sheets.find((s) => s.parts.some((p) => p.partId === plain.id))!;
    const placed = sheet.parts.find((p) => p.partId === plain.id)!;
    const opts = { safeNames: false, includeSheetOutline: false, includeLabels: false };
    const { drawing: sheetDrawing } = composeSheet(project.params, project.parts, sheet, opts);
    const t = partTransform(plain, placed);

    const own = partDrawing(plain, opts, false);
    expect(own.paths.length).toBeGreaterThan(0);
    for (const p of own.paths) {
      expect(sheetDrawing.paths).toContainEqual({ layer: p.layer, path: applyToPath(p.path, t) });
    }
    for (const c of own.circles) {
      const moved = t({ x: c.x, y: c.y });
      expect(sheetDrawing.circles).toContainEqual({ ...c, x: moved.x, y: moved.y });
    }
  });

  it("mirrors a face-B feature across the blank's own centre, not a sheet that does not exist here", () => {
    expect(partsNeedingFlip([flipped]).map((p) => p.id)).toContain(flipped.id);
    const bPocket = pocketsOn(flipped, 'B')[0];
    expect(bPocket).toBeDefined();

    // The exact formula `mirrorAcrossSheet` computes, with the blank's own
    // `minX + maxX` standing in for a sheet's length — what keeps a blank
    // whose local frame does not start at x = 0 mirrored about its own centre.
    const bb = bboxOf(flipped.outline);
    const turnAxis = bb.minX + bb.maxX;
    const expectedPath = {
      closed: bPocket!.path.closed,
      pts: bPocket!.path.pts.map((v) => ({
        x: turnAxis - v.x,
        y: v.y,
        ...(v.bulge ? { bulge: -v.bulge } : {}),
      })),
    };
    const expectedLayer = pocketLayer(bPocket!.depth, { safeNames: false }) + FLIP_SUFFIX;

    const d = partDrawing(flipped, { safeNames: false }, false);
    expect(d.paths).toContainEqual({ layer: expectedLayer, path: expectedPath });

    // And never outside the blank's own footprint — the point of turning the
    // blank over rather than mirroring it across a sheet it is not sitting on.
    for (const v of expectedPath.pts) {
      expect(v.x).toBeGreaterThanOrEqual(bb.minX - 1e-6);
      expect(v.x).toBeLessThanOrEqual(bb.maxX + 1e-6);
    }
  });

  it('leaves a through cut alone: it reads the same from either face', () => {
    const throughs = flipped.features.filter((f): f is ThroughFeature => f.kind === 'through');
    if (throughs.length === 0) return; // nothing to check on this particular part today
    const d = partDrawing(flipped, { safeNames: false }, false);
    for (const f of throughs) {
      expect(d.paths).toContainEqual({ layer: 'THROUGH', path: f.path });
    }
  });

  it('omits the engraved id unless asked for it, and includes it when asked', () => {
    const withoutLabels = partDrawing(plain, { safeNames: false }, false);
    expect(withoutLabels.texts).toHaveLength(0);

    const withLabels = partDrawing(plain, { safeNames: false }, true);
    expect(withLabels.texts).toHaveLength(1);
    expect(withLabels.texts[0]!.text).toBe(plain.id);
  });

  describe('exportPart', () => {
    it('names the file after the part id', () => {
      expect(exportPart(plain).file.name).toBe(`${plain.id}.dxf`);
      expect(exportPart(flipped).file.name).toBe(`${flipped.id}.dxf`);
    });

    it('reports flipped exactly where partsNeedingFlip does', () => {
      expect(exportPart(plain).flipped).toBe(false);
      expect(exportPart(flipped).flipped).toBe(true);
    });

    it('writes a DXF file carrying the _FLIP layer a flipped part needs', () => {
      const dxf = exportPart(flipped).file.dxf;
      expect(dxf.startsWith('0\r\nSECTION')).toBe(true);
      expect(dxf).toContain('OUTLINE');
      expect(dxf).toContain('_FLIP');
    });

    it('respects safe layer names, the same as a sheet export does', () => {
      const safe = exportPart(flipped, {
        safeNames: true,
        includeSheetOutline: false,
        includeLabels: true,
      }).file.dxf;
      // A dot only ever appears in a coordinate value (six decimals), never
      // in a layer name, once safe names are on — layer names follow group
      // code 8 wherever they appear, in the table and on every entity.
      const lines = safe.split('\r\n');
      const layerValues = lines.filter((line, i) => lines[i - 1] === '8');
      expect(layerValues.length).toBeGreaterThan(0);
      expect(layerValues.some((l) => l.includes('.'))).toBe(false);
    });
  });
});

import { bboxOf, type Path } from '../geom/index.js';
import type { Part } from '../model/types.js';
import { drillLayer, FLIP_SUFFIX, LAYER, pocketLayer, type LayerOptions } from './layers.js';
import { emptyDrawing, writeDxf, type DxfDrawing } from './dxf.js';
import { mirrorAcrossSheet, mirrorPoint } from './transform.js';
import { defaultExportOptions, type SheetExportOptions, type SheetFile } from './sheet.js';

/**
 * One part on its own, in its local machining frame — never placed on a
 * sheet. `PartView.tsx` draws this same function's output on screen, so what
 * is shown and what downloads can never drift apart from each other.
 *
 * It is not the same function as `composeSheet`, and deliberately cannot be:
 * a face-B feature there is mirrored across the whole *sheet*, because the
 * operator turns the whole sheet over and every other part on it has to stay
 * consistent with that one turn. There is no sheet here — the operator turns
 * over this one loose blank on its own — so a face-B feature is mirrored
 * across the *blank's own centre* instead, which is a different axis in
 * general and answers a genuinely different physical question. What the two
 * functions do share, and what `part-export.test.ts` pins directly against
 * `composeSheet`'s own output, is every decision that does not depend on
 * which of those two things is being turned over: the outline, through cuts,
 * face-A features, and which layer and `_FLIP` suffix a feature gets.
 * `mirrorAcrossSheet` already computes `length - x`; passing the blank's own
 * `minX + maxX` where a sheet export passes the sheet's length gives exactly
 * the blank's own centre, including for one whose local frame does not start
 * at x = 0.
 */
export function partDrawing(
  part: Part,
  opts: LayerOptions = { safeNames: false },
  includeLabels = true,
): DxfDrawing {
  const drawing = emptyDrawing();
  const bb = bboxOf(part.outline);
  const turnAxis = bb.minX + bb.maxX;

  drawing.paths.push({ layer: LAYER.outline, path: part.outline });

  for (const f of part.features) {
    const flip = f.kind !== 'through' && f.side === 'B';
    const suffix = flip ? FLIP_SUFFIX : '';
    const place = (path: Path): Path => (flip ? mirrorAcrossSheet(path, turnAxis) : path);

    if (f.kind === 'pocket') {
      drawing.paths.push({ layer: pocketLayer(f.depth, opts) + suffix, path: place(f.path) });
    } else if (f.kind === 'through') {
      drawing.paths.push({ layer: LAYER.through, path: f.path });
    } else if (f.kind === 'drill') {
      const thru = f.depth === 'thru';
      const p = thru || !flip ? { x: f.x, y: f.y } : mirrorPoint({ x: f.x, y: f.y }, turnAxis);
      drawing.circles.push({
        layer: drillLayer(f.diameter, f.depth, opts) + (thru ? '' : suffix),
        x: p.x,
        y: p.y,
        radius: f.diameter / 2,
      });
    } else if (f.kind === 'engrave' && includeLabels) {
      // Never mirrored, same as a sheet export: a label is read where it is
      // cut, not where the geometry it is next to ends up after a flip.
      drawing.texts.push({ layer: LAYER.label, x: f.x, y: f.y, height: f.height, text: f.text });
    }
  }

  return drawing;
}

export interface PartExport {
  file: SheetFile;
  /** Has to be turned over on the bed to reach every feature — see `partsNeedingFlip`. */
  flipped: boolean;
}

/**
 * One part, exported on its own — the answer to "I ruined this one panel",
 * which otherwise means opening the whole sheet zip in another program to
 * find and extract it. Filed under the part's own id: already the identifier
 * engraved on the blank, and already unique across the project.
 */
export function exportPart(
  part: Part,
  opts: SheetExportOptions = defaultExportOptions(),
): PartExport {
  const drawing = partDrawing(part, opts, opts.includeLabels);
  const flipped = part.features.some((f) => f.kind !== 'through' && f.side === 'B');
  return { file: { name: `${part.id}.dxf`, dxf: writeDxf(drawing) }, flipped };
}

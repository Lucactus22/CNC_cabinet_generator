import { rect, type Path } from '../geom/index.js';
import type { CabinetParams, Part } from '../model/types.js';
import type { NestedSheet } from '../nest/index.js';
import { planTiles, type TilePlan } from '../machine/tiling.js';
import { clipPathToBand, circleInBand, type Band } from './clip.js';
import {
  drillLayer,
  FLIP_SUFFIX,
  LAYER,
  pocketLayer,
  type LayerOptions,
} from './layers.js';
import { emptyDrawing, writeDxf, type DxfDrawing } from './dxf.js';
import { applyToPath, mirrorAcrossSheet, mirrorPoint, partTransform } from './transform.js';

export interface SheetExportOptions extends LayerOptions {
  /** Draw the sheet outline for reference. */
  includeSheetOutline: boolean;
  /** Engrave part identifiers. */
  includeLabels: boolean;
}

export const defaultExportOptions = (): SheetExportOptions => ({
  safeNames: false,
  includeSheetOutline: true,
  includeLabels: true,
});

export interface SheetFile {
  name: string;
  dxf: string;
}

export interface SheetExport {
  /** The whole sheet in one file. */
  full: SheetFile;
  /** One file per tile, each zeroed to its own origin, when tiling is needed. */
  tiles: SheetFile[];
  plan: TilePlan | null;
  warnings: string[];
}

/**
 * Turn one nested sheet into DXF.
 *
 * Geometry machined from the second face goes onto _FLIP layers, mirrored
 * across the sheet, so it lands correctly once the sheet is turned over left to
 * right. Those parts are flagged in the diagnostics as well.
 */
export function composeSheet(
  params: CabinetParams,
  parts: Part[],
  sheet: NestedSheet,
  opts: SheetExportOptions,
): { drawing: DxfDrawing; warnings: string[] } {
  const drawing = emptyDrawing();
  const warnings: string[] = [];
  const byId = new Map(parts.map((p) => [p.id, p]));

  if (opts.includeSheetOutline) {
    drawing.paths.push({ layer: LAYER.sheet, path: rect(0, 0, sheet.length, sheet.width) });
  }

  for (const placed of sheet.parts) {
    const part = byId.get(placed.partId);
    if (!part) continue;
    const t = partTransform(part, placed);

    drawing.paths.push({ layer: LAYER.outline, path: applyToPath(part.outline, t) });

    for (const f of part.features) {
      const flip = f.kind !== 'through' && f.side === 'B';
      const suffix = flip ? FLIP_SUFFIX : '';
      const place = (path: Path): Path => {
        const moved = applyToPath(path, t);
        return flip ? mirrorAcrossSheet(moved, sheet.length) : moved;
      };

      if (f.kind === 'pocket') {
        drawing.paths.push({ layer: pocketLayer(f.depth, opts) + suffix, path: place(f.path) });
      } else if (f.kind === 'through') {
        drawing.paths.push({ layer: LAYER.through, path: place(f.path) });
      } else if (f.kind === 'drill') {
        const thru = f.depth === 'thru';
        const p0 = t({ x: f.x, y: f.y });
        const p = thru || !flip ? p0 : mirrorPoint(p0, sheet.length);
        drawing.circles.push({
          layer: drillLayer(f.diameter, f.depth, opts) + (thru ? '' : suffix),
          x: p.x,
          y: p.y,
          radius: f.diameter / 2,
        });
      } else if (f.kind === 'engrave' && opts.includeLabels) {
        const p = t({ x: f.x, y: f.y });
        drawing.texts.push({ layer: LAYER.label, x: p.x, y: p.y, height: f.height, text: f.text });
      }
    }
  }

  const flipped = drawing.paths.some((p) => p.layer.endsWith(FLIP_SUFFIX));
  if (flipped) {
    warnings.push(
      `Sheet ${sheet.index + 1} has features on both faces. Cut every layer without ${FLIP_SUFFIX} first, turn the sheet over left to right, then cut the ${FLIP_SUFFIX} layers.`,
    );
  }

  return { drawing, warnings };
}

/** Compose a sheet and, when it is longer than the machine, split it into tiles. */
export function exportSheet(
  params: CabinetParams,
  parts: Part[],
  sheet: NestedSheet,
  opts: SheetExportOptions = defaultExportOptions(),
): SheetExport {
  const { drawing, warnings } = composeSheet(params, parts, sheet, opts);
  // Tiling follows how far the parts reach, not the blank's nominal length.
  const plan = planTiles(sheet.contentLength, sheet.width, params.machine, params.nesting.sheetMargin);

  const base = `${slug(params.name)}-sheet${sheet.index + 1}`;
  const full: SheetFile = { name: `${base}.dxf`, dxf: writeDxf(drawing) };
  if (!plan) return { full, tiles: [], plan: null, warnings };

  const tiles: SheetFile[] = [];
  for (const tile of plan.tiles) {
    const band: Band = { from: tile.from, to: tile.to, axis: plan.axis };
    const cut = sliceDrawing(drawing, band, plan, warnings, tile.index);
    // Zero each tile to its own origin so it can be loaded and cut directly.
    const shifted = shiftDrawing(cut, -tile.from, 0);
    tiles.push({ name: `${base}-tile${tile.index + 1}.dxf`, dxf: writeDxf(shifted) });
  }

  warnings.push(
    `Sheet ${sheet.index + 1} is cut in ${plan.tiles.length} tiles. Drill the ${LAYER.tileReg} holes through into the spoilboard, pin them, cut the tile, then slide the stock ${plan.step.toFixed(0)} mm along ${plan.axis.toUpperCase()} against the fence and re-pin.`,
  );

  return { full, tiles, plan, warnings };
}

function sliceDrawing(
  d: DxfDrawing,
  band: Band,
  plan: TilePlan,
  warnings: string[],
  tileIndex: number,
): DxfDrawing {
  const out = emptyDrawing();

  for (const p of d.paths) {
    if (p.layer === LAYER.sheet) continue; // the reference outline is not per-tile
    const clipped = clipPathToBand(p.path, band);
    if (clipped) out.paths.push({ layer: p.layer, path: clipped });
  }

  for (const c of d.circles) {
    const where = circleInBand(c.x, c.y, c.radius, band);
    if (where === 'inside') out.circles.push(c);
    else if (where === 'straddles') {
      // A hole cut in two halves in two setups will never be round.
      warnings.push(
        `A ${(c.radius * 2).toFixed(1)} mm hole sits on the seam of tile ${tileIndex + 1} and was left out. Nudge the nesting or the tile overlap.`,
      );
    }
  }

  for (const t of d.texts) {
    const v = band.axis === 'x' ? t.x : t.y;
    if (v >= band.from && v <= band.to) out.texts.push(t);
  }

  // Registration holes: one pair per seam, at the same spacing as the feed, so
  // the previous tile's holes drop onto the same pins after the stock moves.
  for (const rx of plan.registrationX) {
    if (rx < band.from - 1e-9 || rx > band.to + 1e-9) continue;
    for (const ry of plan.registrationY) {
      out.circles.push({
        layer: LAYER.tileReg,
        x: plan.axis === 'x' ? rx : ry,
        y: plan.axis === 'x' ? ry : rx,
        radius: plan.holeDiameter / 2,
      });
    }
  }

  return out;
}

function shiftDrawing(d: DxfDrawing, dx: number, dy: number): DxfDrawing {
  if (dx === 0 && dy === 0) return d;
  return {
    paths: d.paths.map((p) => ({
      layer: p.layer,
      path: {
        closed: p.path.closed,
        pts: p.path.pts.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy })),
      },
    })),
    circles: d.circles.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    texts: d.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
  };
}

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cabinet';

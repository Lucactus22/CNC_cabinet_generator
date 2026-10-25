import { bboxOf, rect, type Path } from '../geom/index.js';
import type { ProjectParams, Part } from '../model/types.js';
import type { NestedSheet } from '../nest/index.js';
import { cutAfterTurning, machiningReach, planTiles, type TilePlan } from '../machine/tiling.js';
import { clipPathToBand, clipProfileToBand, circleInBand, type Band } from './clip.js';
import {
  drillLayer,
  FLIP_SUFFIX,
  LAYER,
  OPEN_SUFFIX,
  pocketLayer,
  type LayerOptions,
} from './layers.js';
import { emptyDrawing, writeDxf, type DxfCircle, type DxfDrawing } from './dxf.js';
import {
  applyToPath,
  mirrorAcrossSheet,
  mirrorPoint,
  partTransform,
  textRotation,
} from './transform.js';

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
 * right. Those parts are flagged in the diagnostics as well; how to turn the
 * sheet is said by `exportSheet`, which knows whether it is tiled.
 */
export function composeSheet(
  params: ProjectParams,
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
      const flip = cutAfterTurning(f);
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
        const p0 = t({ x: f.x, y: f.y });
        const p = flip ? mirrorPoint(p0, sheet.length) : p0;
        drawing.circles.push({
          layer: drillLayer(f.diameter, f.depth, opts) + suffix,
          x: p.x,
          y: p.y,
          radius: f.diameter / 2,
          partId: part.id,
        });
      } else if (f.kind === 'engrave' && opts.includeLabels) {
        const p = t({ x: f.x, y: f.y });
        const rotation = textRotation(t, f, f.runs);
        drawing.texts.push({
          layer: LAYER.label,
          x: p.x,
          y: p.y,
          height: f.height,
          text: f.text,
          ...(rotation ? { rotation } : {}),
        });
      }
    }
  }

  return { drawing, warnings };
}

/** Compose a sheet and, when it is longer than the machine, split it into tiles. */
export function exportSheet(
  params: ProjectParams,
  parts: Part[],
  sheet: NestedSheet,
  opts: SheetExportOptions = defaultExportOptions(),
  /** 'board' for solid-stock boards nested by `nest/stock.ts`, otherwise a sheet. */
  label = 'sheet',
): SheetExport {
  const { drawing, warnings } = composeSheet(params, parts, sheet, opts);
  // Tiling follows how far the machining reaches — on both faces — not the
  // blank's nominal length.
  const plan = planTiles(
    machiningReach(sheet, parts),
    sheet.width,
    params.machine,
    params.nesting.sheetMargin,
  );

  const base = `${slug(params.name)}-${label}${sheet.index + 1}`;
  const full: SheetFile = { name: `${base}.dxf`, dxf: writeDxf(drawing) };
  const noun = label === 'board' ? 'Board' : 'Sheet';
  const name = `${noun} ${sheet.index + 1}`;
  // Drilling counts as much as a groove: a sheet whose only second-face work
  // is a row of shelf-pin holes still has to be turned over for it.
  const turned = hasFlip(drawing);
  if (!plan) {
    if (turned) {
      warnings.push(
        `${name} has features on both faces. Cut every layer without ${FLIP_SUFFIX} first, turn the ${label} over left to right, then cut the ${FLIP_SUFFIX} layers.`,
      );
    }
    return { full, tiles: [], plan: null, warnings };
  }

  // How to work the tiles first, then what each tile is missing: the order
  // they are read in at the machine.
  warnings.push(
    `${name} is cut in ${plan.tiles.length} tiles. Drill the ${LAYER.tileReg} holes through into the spoilboard, pin them, cut the tile, then slide the stock ${plan.step.toFixed(0)} mm along ${plan.axis.toUpperCase()} against the fence and re-pin.`,
  );
  if (turned) {
    warnings.push(
      `${name} has features on both faces, so its tiles are worked twice: cut every tile's layers without ${FLIP_SUFFIX}, turn the ${label} over left to right so its far end comes to the origin, then go through the tiles again from tile 1 for the ${FLIP_SUFFIX} layers, pinning on ${LAYER.tileReg}${FLIP_SUFFIX} — the first pass's holes are no longer where the pins are.`,
    );
  }

  const pocketReach = Math.min(params.tool.diameter, params.machine.tileOverlap);
  if (pocketReach < params.tool.diameter && pocketsCrossSeams(drawing, plan)) {
    warnings.push(
      `${name}: a groove crosses a tile seam, and the ${params.machine.tileOverlap} mm tile overlap is narrower than the ${params.tool.diameter} mm cutter, so the tile before the seam cannot reach far enough past it: a rib ${(params.tool.diameter - pocketReach).toFixed(1)} mm wide is left across the groove. Pare it by hand, or set the tile overlap to at least the cutter's diameter.`,
    );
  }
  const tiles: SheetFile[] = [];
  for (const tile of plan.tiles) {
    const band: Band = { from: tile.from, to: tile.to, axis: plan.axis };
    // A pocket closed at the seam on both sides leaves a rib a cutter wide
    // across it, each tile's cutter stopping a radius short of the line. The
    // tile before a seam reaches a cutter's width past it instead — into the
    // overlap, which is there for exactly this kind of headroom.
    const past = tile.index < plan.tiles.length - 1 ? pocketReach : 0;
    const cut = sliceDrawing(drawing, band, plan, warnings, tile.index, name, turned, past);
    // Zero each tile to its own origin so it can be loaded and cut directly.
    const shifted = shiftDrawing(cut, -tile.from, 0);
    tiles.push({ name: `${base}-tile${tile.index + 1}.dxf`, dxf: writeDxf(shifted) });
  }

  const crossing = partsCrossingSeams(parts, sheet, plan);
  if (crossing.length > 0) {
    warnings.push(
      `${name}: ${crossing.join(', ')} ${crossing.length === 1 ? 'crosses' : 'cross'} a tile seam, so each tile carries only its own stretch of the profile, on ${LAYER.outline}${OPEN_SUFFIX} (${LAYER.through}${OPEN_SUFFIX} for a cut-out). Cut an outline with the cutter on the right of the direction of travel and a cut-out with it on the left, and let each stop at the seam — closing it there would cut the part in two.`,
    );
  }

  return { full, tiles, plan, warnings };
}

/** Parts whose blank lies across a seam, so their profile is cut in more than one tile. */
function partsCrossingSeams(parts: Part[], sheet: NestedSheet, plan: TilePlan): string[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const placed of sheet.parts) {
    const part = byId.get(placed.partId);
    if (!part) continue;
    const bb = bboxOf(applyToPath(part.outline, partTransform(part, placed)));
    if (plan.registrationX.some((seam) => bb.minX < seam - 1e-9 && seam + 1e-9 < bb.maxX)) {
      out.push(part.id);
    }
  }
  return out;
}

/** Whether any pocket on the sheet lies across a seam. */
function pocketsCrossSeams(d: DxfDrawing, plan: TilePlan): boolean {
  return d.paths.some((p) => {
    if (p.layer === LAYER.sheet || p.layer === LAYER.outline || p.layer === LAYER.through) {
      return false;
    }
    const bb = bboxOf(p.path);
    return plan.registrationX.some((seam) => bb.minX < seam - 1e-9 && seam + 1e-9 < bb.maxX);
  });
}

const hasFlip = (d: DxfDrawing): boolean =>
  [...d.paths, ...d.circles, ...d.texts].some((e) => e.layer.endsWith(FLIP_SUFFIX));

function sliceDrawing(
  d: DxfDrawing,
  band: Band,
  plan: TilePlan,
  warnings: string[],
  tileIndex: number,
  /** "Sheet 2", for the warnings: a hole left out has to be findable. */
  name: string,
  /** Whether the sheet is turned over partway and needs pins for the second pass too. */
  turned: boolean,
  /** How far past the band's far seam a pocket reaches. */
  pocketPast: number,
): DxfDrawing {
  const out = emptyDrawing();
  const pocketBand: Band = { ...band, to: band.to + pocketPast };

  for (const p of d.paths) {
    if (p.layer === LAYER.sheet) continue; // the reference outline is not per-tile
    if (p.layer === LAYER.outline || p.layer === LAYER.through) {
      for (const piece of clipProfileToBand(p.path, band)) {
        out.paths.push({ layer: piece.closed ? p.layer : p.layer + OPEN_SUFFIX, path: piece });
      }
      continue;
    }
    const clipped = clipPathToBand(p.path, pocketBand);
    if (clipped) out.paths.push({ layer: p.layer, path: clipped });
  }

  // A hole cut in two halves in two setups will never be round, so one on a
  // seam is left out of both tiles. Said once, by the tile its centre is in,
  // and grouped by part: someone has to find each one and drill it by hand.
  const leftOut = new Map<string, DxfCircle[]>();
  for (const c of d.circles) {
    const where = circleInBand(c.x, c.y, c.radius, band);
    const centre = band.axis === 'x' ? c.x : c.y;
    if (where === 'inside') out.circles.push(c);
    else if (where === 'straddles' && centre >= band.from && centre < band.to) {
      const key = `${c.partId ?? 'a part'} on ${c.layer}`;
      leftOut.set(key, [...(leftOut.get(key) ?? []), c]);
    }
  }
  for (const [where, holes] of leftOut) {
    const at = holes.map((c) => `(${c.x.toFixed(0)}, ${c.y.toFixed(0)})`).join(', ');
    const one = holes.length === 1;
    const what = one ? 'a hole' : `${holes.length} holes`;
    // A _FLIP hole is drawn where it lands once the sheet is turned over,
    // so that is the face its position is read on.
    const face = holes[0]!.layer.endsWith(FLIP_SUFFIX)
      ? "in the full sheet's file, measured on the turned-over face its _FLIP layers are drawn on"
      : "in the full sheet's file";
    warnings.push(
      `${name}, tile ${tileIndex + 1}: ${what} of ${(holes[0]!.radius * 2).toFixed(1)} mm in ${where} ${one ? 'sits' : 'sit'} on a tile seam and ${one ? 'was' : 'were'} left out of the tile files, at ${at} ${face}. Drill ${one ? 'it' : 'them'} by hand, or nudge the nesting or the tile overlap until ${one ? 'it moves' : 'they move'} off the seam.`,
    );
  }

  for (const t of d.texts) {
    const v = band.axis === 'x' ? t.x : t.y;
    if (v >= band.from && v <= band.to) out.texts.push(t);
  }

  // Registration holes: one pair per seam, at the same spacing as the feed, so
  // the previous tile's holes drop onto the same pins after the stock moves.
  // A sheet turned over partway gets a second set at the same tile positions
  // on a _FLIP layer: turning it end for end moves the first pass's holes to
  // the length of the sheet less where they were, and that is only by chance
  // a multiple of the step.
  const regLayers = turned ? [LAYER.tileReg, LAYER.tileReg + FLIP_SUFFIX] : [LAYER.tileReg];
  for (const rx of plan.registrationX) {
    if (rx < band.from - 1e-9 || rx > band.to + 1e-9) continue;
    for (const layer of regLayers) {
      for (const ry of plan.registrationY) {
        out.circles.push({
          layer,
          x: plan.axis === 'x' ? rx : ry,
          y: plan.axis === 'x' ? ry : rx,
          radius: plan.holeDiameter / 2,
        });
      }
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

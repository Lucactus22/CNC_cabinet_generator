import { bboxOf } from '../geom/index.js';
import type { ProjectParams, Part, PocketFeature } from '../model/types.js';
import type { NestResult } from '../nest/index.js';
import { blankSize } from '../nest/index.js';
import { tileCountFor } from './tiling.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  /** Groups related messages in the UI, e.g. 'machine', 'joinery', 'nesting'. */
  topic: string;
  message: string;
  /** Parts this points at, so the previews can highlight them. */
  partIds?: string[];
  /** The parameter most likely to fix it. */
  hint?: string;
}

/**
 * Everything the user needs to know before cutting, in one pass.
 *
 * The rule throughout: an error means the job cannot be made as configured, a
 * warning means it can but something will bite, and info is just useful.
 */
export function checkManufacturability(
  params: ProjectParams,
  parts: Part[],
  nest: NestResult,
  joineryWarnings: string[],
  flipParts: Part[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const m = params.machine;

  // --- The run itself ----------------------------------------------------
  if (params.cabinets.length === 0) {
    out.push({
      severity: 'warning',
      topic: 'project',
      message: 'This project has no cabinets in it, so there is nothing to cut.',
      hint: 'Add a cabinet to the run.',
    });
  }
  for (const [id, ids] of duplicateIds(parts)) {
    // Part IDs are how the nester, the cut list and the engraved label all
    // refer to a panel. Two panels sharing one means the sheet layout silently
    // drops a part and two different blanks get the same label at the machine.
    out.push({
      severity: 'error',
      topic: 'project',
      message: `${ids.length} different panels are all called ${id}. Two cabinets or two carcasses are sharing an id.`,
      partIds: [id],
      hint: 'Give each cabinet, and each carcass within a cabinet, its own id.',
    });
  }
  const feedsAlongX = m.tilingAxis === 'x';
  const fixedTravel = m.tilingAxis === 'none' ? m.travelY : feedsAlongX ? m.travelY : m.travelX;
  const feedTravel = feedsAlongX ? m.travelX : m.travelY;

  // --- Sheet against the machine ----------------------------------------
  for (const material of params.materials) {
    if (!parts.some((p) => p.materialId === material.id)) continue;
    const across = material.sheetWidth;
    if (m.tilingAxis === 'none') {
      if (material.sheetLength > m.travelX + 1e-6 || across > m.travelY + 1e-6) {
        out.push({
          severity: 'error',
          topic: 'machine',
          message: `${material.name}: a ${material.sheetLength} x ${across} mm sheet does not fit a ${m.travelX} x ${m.travelY} mm machine, and tiling is switched off.`,
          hint: 'Enable tiling, or set the sheet size to match your machine.',
        });
      }
      continue;
    }
    if (across > fixedTravel + 1e-6) {
      out.push({
        severity: 'error',
        topic: 'machine',
        message: `${material.name}: the sheet is ${across} mm across the feed direction but the machine only has ${fixedTravel} mm of travel there. Feeding the stock through cannot help, because that axis never moves.`,
        hint: `Rip the sheets to ${fixedTravel} mm or less first, or set the sheet size to match your machine.`,
      });
    }
  }

  // --- Individual parts against the machine ------------------------------
  const tooBig: string[] = [];
  for (const part of parts) {
    const material = params.materials.find((x) => x.id === part.materialId);
    if (!material) continue;
    const { w, h } = blankSize(part, material);
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const fits =
      m.tilingAxis === 'none'
        ? (w <= m.travelX && h <= m.travelY) || (h <= m.travelX && w <= m.travelY)
        : short <= fixedTravel + 1e-6;
    if (!fits) {
      tooBig.push(part.id);
      out.push({
        severity: 'error',
        topic: 'machine',
        message: `${part.label} is ${w.toFixed(0)} x ${h.toFixed(0)} mm and cannot be cut on this machine: its smaller dimension of ${short.toFixed(0)} mm already exceeds the ${fixedTravel} mm of travel on the axis that does not feed.`,
        partIds: [part.id],
        hint: 'Reduce the carcass size, or use a machine with more travel across the feed.',
      });
    } else if (m.tilingAxis !== 'none' && long > feedTravel + 1e-6) {
      out.push({
        severity: 'info',
        topic: 'machine',
        message: `${part.label} is ${long.toFixed(0)} mm long, so it spans more than one tile.`,
        partIds: [part.id],
      });
    }
  }

  // --- Tiling ------------------------------------------------------------
  const step = feedTravel - m.tileOverlap;
  if (m.tilingAxis !== 'none' && step <= 0) {
    out.push({
      severity: 'error',
      topic: 'machine',
      message: `The tile overlap of ${m.tileOverlap} mm is larger than the ${feedTravel} mm of travel on the feed axis, so the stock would never advance.`,
      hint: 'Reduce the tile overlap.',
    });
  }
  for (const sheet of nest.sheets) {
    const tiles = tileCountFor(params, sheet.contentLength);
    if (tiles > 1) {
      out.push({
        severity: 'warning',
        topic: 'machine',
        message: `Sheet ${sheet.index + 1} has parts reaching ${sheet.contentLength.toFixed(0)} mm along its length, so it needs ${tiles} setups, feeding the stock through in the ${m.tilingAxis.toUpperCase()} direction.`,
        hint:
          params.nesting.strategy === 'material'
            ? 'Switch nesting to fewest setups, or set the sheet size to match your machine.'
            : 'Set the sheet size to match your machine to avoid tiling entirely.',
      });
    }
  }

  // --- Nesting -----------------------------------------------------------
  if (nest.unplaced.length > 0) {
    out.push({
      severity: 'error',
      topic: 'nesting',
      message: `${nest.unplaced.length} part(s) are too big for the sheet they are cut from.`,
      partIds: nest.unplaced,
      hint: 'Use a larger sheet, or reduce the cabinet size.',
    });
  }
  for (const sheet of nest.sheets) {
    if (sheet.yield < 0.4) {
      out.push({
        severity: 'info',
        topic: 'nesting',
        message: `Sheet ${sheet.index + 1} is only ${(sheet.yield * 100).toFixed(0)}% used.`,
      });
    }
  }

  // --- Joinery and tooling ----------------------------------------------
  for (const w of joineryWarnings) {
    out.push({ severity: 'warning', topic: 'joinery', message: w });
  }
  if (flipParts.length > 0) {
    out.push({
      severity: 'warning',
      topic: 'machining',
      message: `${flipParts.length} part(s) are machined on both faces and have to be turned over on the bed: ${flipParts.map((p) => p.id).join(', ')}.`,
      partIds: flipParts.map((p) => p.id),
      hint: 'A divider with shelves on both sides always needs this.',
    });
  }

  // --- Pockets meeting through the panel ---------------------------------
  for (const part of parts) {
    for (const thin of residualThickness(part)) {
      out.push(
        thin.residual <= 0
          ? {
              severity: 'error',
              topic: 'machining',
              message: `${part.label}: pockets on opposite faces overlap and meet through the panel, leaving a hole ${(-thin.residual).toFixed(1)} mm past breaking through.`,
              partIds: [part.id],
              hint: 'Reduce one of the two depths, or move the feature.',
            }
          : {
              severity: 'warning',
              topic: 'machining',
              message: `${part.label}: pockets on opposite faces cross, leaving only ${thin.residual.toFixed(1)} mm of material where they meet.`,
              partIds: [part.id],
              hint: 'Reduce one of the two depths if the panel has to carry load there.',
            },
      );
    }
  }

  // --- Structural sanity -------------------------------------------------
  for (const part of parts) {
    if (part.role !== 'shelf') continue;
    const span = Math.max(part.width, part.height);
    // Rule of thumb for plywood: past about 40 times its thickness a shelf
    // visibly sags under books or crockery.
    if (span > part.thickness * 40) {
      out.push({
        severity: 'warning',
        topic: 'structure',
        message: `${part.label} spans ${span.toFixed(0)} mm in ${part.thickness.toFixed(1)} mm material and will sag under load.`,
        partIds: [part.id],
        hint: 'Add a divider, use thicker material, or add a front edge stiffener.',
      });
    }
  }

  const sheetsUsed = nest.sheets.length;
  if (sheetsUsed > 0) {
    const avg = nest.sheets.reduce((a, s) => a + s.yield, 0) / sheetsUsed;
    out.push({
      severity: 'info',
      topic: 'nesting',
      message: `${parts.length} parts on ${sheetsUsed} sheet(s), averaging ${(avg * 100).toFixed(0)}% yield.`,
    });
  }
  if (tooBig.length === 0 && m.tilingAxis !== 'none') {
    out.push({
      severity: 'info',
      topic: 'machine',
      message: `Every part fits within the ${fixedTravel} mm of travel across the feed direction.`,
    });
  }

  return out;
}

/** Part IDs claimed by more than one panel. */
function duplicateIds(parts: Part[]): Map<string, Part[]> {
  const byId = new Map<string, Part[]>();
  for (const p of parts) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  for (const [id, list] of byId) if (list.length < 2) byId.delete(id);
  return byId;
}

/** Material left where a pocket on one face crosses a pocket on the other. */
export function residualThickness(part: Part): Array<{ residual: number }> {
  const a: PocketFeature[] = [];
  const b: PocketFeature[] = [];
  for (const f of part.features) {
    if (f.kind !== 'pocket') continue;
    (f.side === 'A' ? a : b).push(f);
  }
  if (a.length === 0 || b.length === 0) return [];

  // Both faces are described in the same local frame, so the pockets can be
  // compared directly; the mirroring at export time is a flip of the sheet, not
  // a change of coordinates.
  const out: Array<{ residual: number }> = [];
  let worst = Infinity;
  for (const pa of a) {
    const ba = bboxOf(pa.path);
    for (const pb of b) {
      const bb = bboxOf(pb.path);
      const overlaps =
        ba.minX < bb.maxX - 1e-6 &&
        bb.minX < ba.maxX - 1e-6 &&
        ba.minY < bb.maxY - 1e-6 &&
        bb.minY < ba.maxY - 1e-6;
      if (!overlaps) continue;
      worst = Math.min(worst, part.thickness - pa.depth - pb.depth);
    }
  }
  // One report per part: a dozen crossings all say the same thing.
  if (worst < 4) out.push({ residual: worst });
  return out;
}

export const errorsOf = (d: Diagnostic[]): Diagnostic[] => d.filter((x) => x.severity === 'error');
export const warningsOf = (d: Diagnostic[]): Diagnostic[] =>
  d.filter((x) => x.severity === 'warning');

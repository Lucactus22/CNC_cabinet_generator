import type { CabinetParams, Part } from '../model/types.js';
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
  params: CabinetParams,
  parts: Part[],
  nest: NestResult,
  joineryWarnings: string[],
  flipParts: Part[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const m = params.machine;
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
    const tiles = tileCountFor(params, sheet.length);
    if (tiles > 1) {
      out.push({
        severity: 'warning',
        topic: 'machine',
        message: `Sheet ${sheet.index + 1} is ${sheet.length} mm long and needs ${tiles} tiles, feeding the stock through in the ${m.tilingAxis.toUpperCase()} direction.`,
        hint: 'Set the sheet size to match your machine to avoid tiling entirely.',
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

export const errorsOf = (d: Diagnostic[]): Diagnostic[] => d.filter((x) => x.severity === 'error');
export const warningsOf = (d: Diagnostic[]): Diagnostic[] =>
  d.filter((x) => x.severity === 'warning');

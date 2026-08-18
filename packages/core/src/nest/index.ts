import { bboxOf } from '../geom/index.js';
import type { CabinetParams, Material, Part } from '../model/types.js';
import { MaxRectsBin, type Placement } from './maxrects.js';

export * from './maxrects.js';

export interface NestedPart {
  partId: string;
  /** Lower-left corner of the part's bounding box on the sheet. */
  x: number;
  y: number;
  /** True when the blank was turned 90 degrees to fit. */
  rotated: boolean;
  w: number;
  h: number;
}

export interface NestedSheet {
  index: number;
  materialId: string;
  /** Along the sheet's length, which is the X axis of the nest. */
  length: number;
  /** Across the sheet, the Y axis of the nest. */
  width: number;
  parts: NestedPart[];
  /** Share of the sheet covered by parts, 0 to 1. */
  yield: number;
}

export interface NestResult {
  sheets: NestedSheet[];
  /** Parts that will not fit on any sheet of their material at all. */
  unplaced: string[];
}

/**
 * Lay every part out on sheets, one run per material.
 *
 * Parts are spaced by a full cutter diameter plus the configured gap, so the
 * profile pass never runs into its neighbour, and grain-locked parts keep their
 * orientation even when turning them would pack better.
 */
export function nestParts(params: CabinetParams, parts: Part[]): NestResult {
  const spacing = params.tool.diameter + params.nesting.partGap;
  const margin = params.nesting.sheetMargin;
  const sheets: NestedSheet[] = [];
  const unplaced: string[] = [];

  const byMaterial = new Map<string, Part[]>();
  for (const p of parts) {
    const list = byMaterial.get(p.materialId) ?? [];
    list.push(p);
    byMaterial.set(p.materialId, list);
  }

  for (const [materialId, group] of byMaterial) {
    const material = params.materials.find((m) => m.id === materialId);
    if (!material) {
      unplaced.push(...group.map((p) => p.id));
      continue;
    }

    const binL = material.sheetLength - 2 * margin;
    const binW = material.sheetWidth - 2 * margin;

    // Largest first: the classic heuristic, and it keeps the layout stable.
    const ordered = [...group].sort((a, b) => area(b) - area(a) || a.id.localeCompare(b.id));

    const bins: { bin: MaxRectsBin; sheet: NestedSheet }[] = [];
    for (const part of ordered) {
      const placed = place(part, material, bins, binL, binW, spacing, params, margin);
      if (placed === 'new-bin') {
        const sheet: NestedSheet = {
          index: sheets.length,
          materialId,
          length: material.sheetLength,
          width: material.sheetWidth,
          parts: [],
          yield: 0,
        };
        const bin = new MaxRectsBin(binL, binW);
        bins.push({ bin, sheet });
        sheets.push(sheet);
        if (place(part, material, bins, binL, binW, spacing, params, margin) !== true) {
          unplaced.push(part.id);
        }
      } else if (placed === false) {
        unplaced.push(part.id);
      }
    }

    for (const { bin, sheet } of bins) {
      const usable = binL * binW;
      sheet.yield = usable > 0 ? bin.usedArea() / usable : 0;
    }
  }

  return { sheets, unplaced };
}

/**
 * Whether a part may be turned on the sheet: only when the material has no
 * directional grain, or the part does not care which way its grain runs.
 */
export function mayRotate(part: Part, material: Material, params: CabinetParams): boolean {
  if (!params.nesting.allowRotation) return false;
  if (!material.hasGrain) return true;
  return part.grainAxis === 'free';
}

/** Blank size on the sheet, honouring the part's grain direction. */
export function blankSize(part: Part, material: Material): { w: number; h: number } {
  const bb = bboxOf(part.outline);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  // Grain runs along the sheet's length, so a part whose grain follows its
  // local v axis has to lie across the sheet.
  if (material.hasGrain && part.grainAxis === 'v') return { w: h, h: w };
  return { w, h };
}

function place(
  part: Part,
  material: Material,
  bins: { bin: MaxRectsBin; sheet: NestedSheet }[],
  binL: number,
  binW: number,
  spacing: number,
  params: CabinetParams,
  margin: number,
): true | false | 'new-bin' {
  const { w, h } = blankSize(part, material);
  const rot = mayRotate(part, material, params);
  const pw = w + spacing;
  const ph = h + spacing;

  const fitsAtAll = pw <= binL + 1e-9 && ph <= binW + 1e-9;
  const fitsTurned = rot && ph <= binL + 1e-9 && pw <= binW + 1e-9;
  if (!fitsAtAll && !fitsTurned) return false;

  for (const { bin, sheet } of bins) {
    const spot: Placement | null = bin.insert(pw, ph, rot);
    if (spot) {
      // The part sits at the corner of its slot; the spacing trails behind it.
      const turned = spot.rotated;
      sheet.parts.push({
        partId: part.id,
        x: margin + spot.x,
        y: margin + spot.y,
        rotated: (material.hasGrain && part.grainAxis === 'v') !== turned,
        w: turned ? h : w,
        h: turned ? w : h,
      });
      return true;
    }
  }
  return 'new-bin';
}

const area = (p: Part): number => {
  const bb = bboxOf(p.outline);
  return (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
};

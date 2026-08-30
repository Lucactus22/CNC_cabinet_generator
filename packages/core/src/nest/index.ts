import { bboxOf } from '../geom/index.js';
import type { ProjectParams, Material, Part, SheetSize } from '../model/types.js';
import { feedStep } from '../machine/tiling.js';
import { MaxRectsBin, overlaps, type BandConstraint, type Placement, type Rect } from './maxrects.js';
import { GuillotineBin } from './guillotine.js';

export * from './maxrects.js';
export * from './guillotine.js';
export * from './stock.js';

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

/** A piece of leftover sheet, big enough on its shorter side to be worth keeping. */
export interface Remnant {
  length: number;
  width: number;
}

export interface NestedSheet {
  index: number;
  materialId: string;
  /**
   * How far along the sheet the parts actually reach. Tiling follows this
   * rather than the blank's nominal length, so a half-filled sheet needs only
   * the setups that cover it.
   */
  contentLength: number;
  /** Along the sheet's length, which is the X axis of the nest. */
  length: number;
  /** Across the sheet, the Y axis of the nest. */
  width: number;
  parts: NestedPart[];
  /** Share of the sheet covered by parts, 0 to 1. */
  yield: number;
  /** Leftover space above `params.nesting.remnantThreshold`, largest first. */
  remnants: Remnant[];
}

export interface NestResult {
  sheets: NestedSheet[];
  /** Parts that will not fit on any sheet of their material at all. */
  unplaced: string[];
}

/** The packer surface `MaxRectsBin` and `GuillotineBin` both offer, so the nester need not know which one it is holding. */
interface Bin {
  insert(w: number, h: number, allowRotate: boolean, bands?: BandConstraint): Placement | null;
  usedArea(): number;
  freeRects(): readonly Rect[];
}

/**
 * Lay every part out on sheets, one run per material.
 *
 * Parts are spaced by a full cutter diameter plus the configured gap, so the
 * profile pass never runs into its neighbour, and grain-locked parts keep their
 * orientation even when turning them would pack better.
 */
export function nestParts(params: ProjectParams, parts: Part[]): NestResult {
  const spacing = params.tool.diameter + params.nesting.partGap;
  const margin = params.nesting.sheetMargin;
  const sheets: NestedSheet[] = [];
  const unplaced: string[] = [];
  const bands = bandsFor(params);

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

    // Largest first: the classic heuristic, and it keeps the layout stable.
    const ordered = [...group].sort((a, b) => area(b) - area(a) || a.id.localeCompare(b.id));

    // How many of each remnant size are left, this material's run only —
    // params itself is never touched, so the pipeline stays pure.
    const remaining = new Map<number, number>();
    const bins: { bin: Bin; sheet: NestedSheet }[] = [];

    for (const part of ordered) {
      const { w, h } = blankSize(part, material);
      const rot = mayRotate(part, material, params);

      const opened = tryOpenBins(bins, w, h, rot, spacing, bands);
      if (opened) {
        pushPlacement(opened.sheet, part, opened.spot, material, w, h, margin);
        continue;
      }

      const choice = chooseSheetSize(material, w, h, rot, spacing, margin, remaining);
      if (!choice) {
        unplaced.push(part.id);
        continue;
      }
      const left = choice.size.quantity === undefined ? undefined : remainingFor(choice, remaining);
      if (left !== undefined) remaining.set(choice.index, left - 1);

      const binL = choice.size.length - 2 * margin;
      const binW = choice.size.width - 2 * margin;
      const bin: Bin =
        params.nesting.strategy === 'guillotine' ? new GuillotineBin(binL, binW) : new MaxRectsBin(binL, binW);
      const sheet: NestedSheet = {
        index: sheets.length,
        materialId,
        contentLength: 0,
        length: choice.size.length,
        width: choice.size.width,
        parts: [],
        yield: 0,
        remnants: [],
      };
      bins.push({ bin, sheet });
      sheets.push(sheet);

      const spot = bin.insert(w + spacing, h + spacing, rot, bands);
      // The bin was just opened at a size chosen to fit this exact part, so
      // failing here would mean chooseSheetSize and the packer disagree.
      if (!spot) {
        unplaced.push(part.id);
        continue;
      }
      pushPlacement(sheet, part, spot, material, w, h, margin);
    }

    for (const { bin, sheet } of bins) {
      const binL = sheet.length - 2 * margin;
      const binW = sheet.width - 2 * margin;
      const usable = binL * binW;
      sheet.yield = usable > 0 ? bin.usedArea() / usable : 0;
      sheet.contentLength = sheet.parts.reduce((a, p) => Math.max(a, p.x + p.w), 0) + margin;
      sheet.remnants = nonOverlapping(bin.freeRects())
        .filter((r) => Math.min(r.w, r.h) >= params.nesting.remnantThreshold)
        .map((r) => ({ length: r.w, width: r.h }))
        .sort((a, b) => b.length * b.width - a.length * a.width);
    }
  }

  return { sheets, unplaced };
}

/**
 * Whether a part may be turned on the sheet: only when the material has no
 * directional grain, or the part does not care which way its grain runs.
 */
export function mayRotate(part: Part, material: Material, params: ProjectParams): boolean {
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

/** Try every sheet already open for this material before opening another. */
function tryOpenBins(
  bins: { bin: Bin; sheet: NestedSheet }[],
  w: number,
  h: number,
  rot: boolean,
  spacing: number,
  bands: BandConstraint | undefined,
): { sheet: NestedSheet; spot: Placement } | null {
  const pw = w + spacing;
  const ph = h + spacing;
  for (const { bin, sheet } of bins) {
    const spot = bin.insert(pw, ph, rot, bands);
    if (spot) return { sheet, spot };
  }
  return null;
}

function pushPlacement(
  sheet: NestedSheet,
  part: Part,
  spot: Placement,
  material: Material,
  w: number,
  h: number,
  margin: number,
): void {
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
}

interface SizeChoice {
  size: SheetSize;
  index: number;
}

function remainingFor(choice: SizeChoice, remaining: Map<number, number>): number {
  return remaining.get(choice.index) ?? choice.size.quantity!;
}

/**
 * Which configured size to open a fresh sheet in, when nothing already open
 * takes the part.
 *
 * Smallest first, so a big remnant or a big standard sheet is not spent on a
 * part a smaller size would have carried — the same reasoning a woodworker
 * uses picking through an offcut rack before opening a new one. A remnant
 * only wins a tie against a standard size of the same area: it is already
 * paid for, so it is used up before a fresh sheet is ordered.
 */
function chooseSheetSize(
  material: Material,
  w: number,
  h: number,
  rot: boolean,
  spacing: number,
  margin: number,
  remaining: Map<number, number>,
): SizeChoice | null {
  let best: SizeChoice | null = null;
  let bestArea = Infinity;
  let bestIsRemnant = false;

  material.sheets.forEach((size, index) => {
    const left = size.quantity === undefined ? Infinity : (remaining.get(index) ?? size.quantity);
    if (left <= 0) return;
    if (!fitsSheetSize(size, w, h, rot, spacing, margin)) return;

    const candidateArea = size.length * size.width;
    const isRemnant = size.quantity !== undefined;
    const better =
      candidateArea < bestArea - 1e-6 ||
      (Math.abs(candidateArea - bestArea) < 1e-6 && isRemnant && !bestIsRemnant);
    if (better) {
      best = { size, index };
      bestArea = candidateArea;
      bestIsRemnant = isRemnant;
    }
  });

  return best;
}

function fitsSheetSize(
  size: SheetSize,
  w: number,
  h: number,
  rot: boolean,
  spacing: number,
  margin: number,
): boolean {
  const binL = size.length - 2 * margin;
  const binW = size.width - 2 * margin;
  const pw = w + spacing;
  const ph = h + spacing;
  return (pw <= binL + 1e-9 && ph <= binW + 1e-9) || (rot && ph <= binL + 1e-9 && pw <= binW + 1e-9);
}

/**
 * Largest first, dropping any candidate that overlaps one already kept.
 *
 * MaxRects's free list can describe the same physical offcut twice, from two
 * different corners; a guillotine bin's never overlaps, so this is a no-op
 * there. Either way the result is honest: no piece of sheet is ever counted
 * as two separate remnants.
 */
function nonOverlapping(rects: readonly Rect[]): Rect[] {
  const ordered = [...rects].sort((a, b) => b.w * b.h - a.w * a.h);
  const kept: Rect[] = [];
  for (const r of ordered) {
    if (kept.some((k) => overlaps(k, r))) continue;
    kept.push(r);
  }
  return kept;
}

/**
 * Where the machine's tile seams fall, in bin coordinates.
 *
 * Seams sit at multiples of the feed step measured from the sheet's own edge,
 * while the bin starts one margin in, hence the phase. Returns undefined when
 * the strategy is to chase yield instead, or when nothing would tile anyway.
 */
export function bandsFor(params: ProjectParams): BandConstraint | undefined {
  if (params.nesting.strategy !== 'tiling') return undefined;
  const step = feedStep(params.machine);
  if (step === null) return undefined;
  return { period: step, phase: params.nesting.sheetMargin };
}

const area = (p: Part): number => {
  const bb = bboxOf(p.outline);
  return (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
};

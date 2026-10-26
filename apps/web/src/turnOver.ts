import {
  cutAfterTurning,
  FLIP_SUFFIX,
  type DxfDrawing,
  type NestedSheet,
  type Part,
  type TilePlan,
} from '@cabgen/core';

/**
 * A sheet's two trips under the spindle, drawn apart.
 *
 * The export puts second-face work on `_FLIP` layers, mirrored across the
 * sheet so it lands correctly once the sheet is turned over. Drawn on top of
 * the first pass that reads as pockets and holes floating in the waste, far
 * from any part — which is exactly the picture of a broken export, and it
 * was reported as one. Each pass is true on its own; only the overlay lies.
 */
export interface Passes {
  first: DxfDrawing;
  /** Null when nothing on the sheet is cut from its second face. */
  second: DxfDrawing | null;
}

const isFlip = (layer: string): boolean => layer.endsWith(FLIP_SUFFIX);

export function splitPasses(drawing: DxfDrawing): Passes {
  const second: DxfDrawing = {
    paths: drawing.paths.filter((p) => isFlip(p.layer)),
    circles: drawing.circles.filter((c) => isFlip(c.layer)),
    texts: drawing.texts.filter((t) => isFlip(t.layer)),
  };
  const turned = second.paths.length + second.circles.length + second.texts.length > 0;
  if (!turned) return { first: drawing, second: null };
  return {
    first: {
      paths: drawing.paths.filter((p) => !isFlip(p.layer)),
      circles: drawing.circles.filter((c) => !isFlip(c.layer)),
      texts: drawing.texts.filter((t) => !isFlip(t.layer)),
    },
    second,
  };
}

/** Where a placed part's footprint stands once the sheet is turned over left to right. */
export function turnedFootprint(
  sheet: Pick<NestedSheet, 'length'>,
  placed: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  return { x: sheet.length - (placed.x + placed.w), y: placed.y, w: placed.w, h: placed.h };
}

/** Ids of the parts on this sheet that have work on their second face. */
export function partsTurnedOver(sheet: Pick<NestedSheet, 'parts'>, parts: Part[]): Set<string> {
  const onSheet = new Set(sheet.parts.map((p) => p.partId));
  return new Set(
    parts.filter((p) => onSheet.has(p.id) && p.features.some(cutAfterTurning)).map((p) => p.id),
  );
}

/**
 * What to do at the machine, in the order to do it.
 *
 * The one thing the file cannot say is what holds the sheet still between the
 * two passes. A single-setup sheet has no locating holes at all — only a tiled
 * one does — so the edges are the datum, and the steps say so rather than
 * leaving a woodworker to look for holes that were never drawn.
 */
export function turnOverSteps(
  sheet: Pick<NestedSheet, 'length' | 'width'>,
  tiles: TilePlan | null,
): string[] {
  const l = sheet.length;
  if (!tiles) {
    return [
      `Push the sheet into the origin corner: its short edge against the stop at X = 0, its long edge against the fence at Y = 0.`,
      `Cut pass 1 — every layer except the ${FLIP_SUFFIX} ones. This sheet has no locating holes: its edges are the datum, so keep both edges hard against the stop and fence the whole time.`,
      `Turn the sheet over left to right, like closing a book along its short edge: the long edge that was on the fence stays on the fence, and the end that was at X = ${l} mm now sits against the stop at X = 0.`,
      `Cut pass 2 — the ${FLIP_SUFFIX} layers. They are already mirrored, so each lands on its part's second face.`,
      `Cut the part profiles last, so every part stays held in the sheet until both faces are done.`,
    ];
  }
  return [
    `This sheet is cut in ${tiles.tiles.length} setups. Each seam has registration holes (${tiles.holeDiameter} mm) on the TILE_REG layer. The tile before the seam drills them through the waste into the spoilboard; drop pins in them.`,
    `Cut pass 1 — every layer except the ${FLIP_SUFFIX} ones — tile by tile. After each tile, slide the sheet ${tiles.step.toFixed(0)} mm along ${tiles.axis.toUpperCase()} so the holes you drilled land on the same pins.`,
    `Turn the sheet over left to right: the long edge that was on the fence stays on the fence, and the far end comes to the origin.`,
    `Pass 2 pins on its own holes, the TILE_REG${FLIP_SUFFIX} ones — the first pass's holes are no longer where the pins are. Go through the tiles again from tile 1, cutting the ${FLIP_SUFFIX} layers.`,
    `Cut the part profiles last, so every part stays held in the sheet until both faces are done.`,
  ];
}

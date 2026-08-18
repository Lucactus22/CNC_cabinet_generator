import { bboxOf, type Path, type Vec2 } from '../geom/index.js';
import type { Part } from '../model/types.js';
import type { NestedPart } from '../nest/index.js';

export type Transform = (p: Vec2) => Vec2;

/**
 * Map a part's local machining coordinates onto its place on the sheet.
 *
 * Only rotation and translation are involved, so arc bulges carry over
 * untouched: neither operation reverses an arc's direction.
 */
export function partTransform(part: Part, placed: NestedPart): Transform {
  const bb = bboxOf(part.outline);
  const h = bb.maxY - bb.minY;
  if (!placed.rotated) {
    return (p) => ({ x: p.x - bb.minX + placed.x, y: p.y - bb.minY + placed.y });
  }
  // 90 degrees counter-clockwise, then shifted so the blank's corner lands on
  // its nested position.
  return (p) => ({ x: -p.y + bb.minY + h + placed.x, y: p.x - bb.minX + placed.y });
}

export function applyToPath(path: Path, t: Transform): Path {
  return {
    closed: path.closed,
    pts: path.pts.map((v) => {
      const q = t(v);
      return v.bulge ? { x: q.x, y: q.y, bulge: v.bulge } : { x: q.x, y: q.y };
    }),
  };
}

/**
 * Mirror geometry across the sheet, for features machined after the sheet is
 * turned over left to right. Mirroring reverses arc direction, so bulges flip.
 */
export function mirrorAcrossSheet(path: Path, sheetLength: number): Path {
  return {
    closed: path.closed,
    pts: path.pts.map((v) => ({
      x: sheetLength - v.x,
      y: v.y,
      ...(v.bulge ? { bulge: -v.bulge } : {}),
    })),
  };
}

export const mirrorPoint = (p: Vec2, sheetLength: number): Vec2 => ({
  x: sheetLength - p.x,
  y: p.y,
});

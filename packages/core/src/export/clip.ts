import { bboxOf, tessellate, type Path, type Vec2 } from '../geom/index.js';

export interface Band {
  from: number;
  to: number;
  axis: 'x' | 'y';
}

/**
 * Trim geometry to a tile.
 *
 * A path that falls wholly inside keeps its exact arcs. Only a path that
 * straddles the seam is flattened and clipped, and the flattening error is
 * bounded by the tessellation sagitta, well under anything a router resolves.
 */
export function clipPathToBand(path: Path, band: Band): Path | null {
  const bb = bboxOf(path);
  const lo = band.axis === 'x' ? bb.minX : bb.minY;
  const hi = band.axis === 'x' ? bb.maxX : bb.maxY;

  if (lo >= band.from - 1e-9 && hi <= band.to + 1e-9) return path;
  if (hi <= band.from + 1e-9 || lo >= band.to - 1e-9) return null;

  let pts: Vec2[] = tessellate(path, 0.02);
  pts = clipHalfPlane(pts, band.axis, band.from, true);
  pts = clipHalfPlane(pts, band.axis, band.to, false);
  if (pts.length < 3) return null;
  return { pts: pts.map((p) => ({ x: p.x, y: p.y })), closed: true };
}

/**
 * Sutherland-Hodgman against one edge. `keepAbove` keeps the side of the line
 * with the larger coordinate.
 */
function clipHalfPlane(pts: Vec2[], axis: 'x' | 'y', at: number, keepAbove: boolean): Vec2[] {
  if (pts.length === 0) return pts;
  const value = (p: Vec2): number => (axis === 'x' ? p.x : p.y);
  const inside = (p: Vec2): boolean => (keepAbove ? value(p) >= at - 1e-9 : value(p) <= at + 1e-9);

  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    const prev = pts[(i - 1 + pts.length) % pts.length]!;
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn !== prevIn) out.push(intersect(prev, cur, axis, at));
    if (curIn) out.push(cur);
  }
  return out;
}

function intersect(a: Vec2, b: Vec2, axis: 'x' | 'y', at: number): Vec2 {
  const av = axis === 'x' ? a.x : a.y;
  const bv = axis === 'x' ? b.x : b.y;
  const d = bv - av;
  const t = Math.abs(d) < 1e-12 ? 0 : (at - av) / d;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Whether a drilled hole sits safely inside a tile rather than across its seam. */
export function circleInBand(
  x: number,
  y: number,
  radius: number,
  band: Band,
): 'inside' | 'outside' | 'straddles' {
  const v = band.axis === 'x' ? x : y;
  if (v - radius >= band.from - 1e-9 && v + radius <= band.to + 1e-9) return 'inside';
  if (v + radius <= band.from + 1e-9 || v - radius >= band.to - 1e-9) return 'outside';
  return 'straddles';
}

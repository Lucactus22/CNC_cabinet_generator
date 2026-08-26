import { Box, EPS, Path, Vec2, Vertex, cross, dist, norm, sub, v } from './types.js';

/** Axis-aligned rectangle, counter-clockwise from its lower-left corner. */
export function rect(x: number, y: number, w: number, h: number): Path {
  return {
    pts: [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)],
    closed: true,
  };
}

export function polygon(pts: Vec2[]): Path {
  return { pts: pts.map((p) => v(p.x, p.y)), closed: true };
}

/** Full circle, expressed as two 180-degree bulge arcs so it round-trips to DXF. */
export function circlePath(cx: number, cy: number, r: number): Path {
  return { pts: [v(cx - r, cy, 1), v(cx + r, cy, 1)], closed: true };
}

export function translatePath(p: Path, dx: number, dy: number): Path {
  return {
    closed: p.closed,
    pts: p.pts.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })),
  };
}

/**
 * Rotate a path about the origin by `deg`. Bulges are rotation-invariant, so
 * they carry over untouched.
 */
export function rotatePath(p: Path, deg: number): Path {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    closed: p.closed,
    pts: p.pts.map((q) => ({ ...q, x: q.x * c - q.y * s, y: q.x * s + q.y * c })),
  };
}

/** Mirror across the vertical line x = axis. Reverses arc direction. */
export function mirrorPathX(p: Path, axis = 0): Path {
  const pts = p.pts.map((q) => ({ ...q, x: 2 * axis - q.x }));
  return reverseBulgeSigns({ closed: p.closed, pts });
}

function reverseBulgeSigns(p: Path): Path {
  return { closed: p.closed, pts: p.pts.map((q) => (q.bulge ? { ...q, bulge: -q.bulge } : q)) };
}

/**
 * Reverse a path's traversal direction. Bulge lives on the vertex that starts a
 * segment, so reversing has to shift the bulges one slot as well as negate them.
 */
export function reversePath(p: Path): Path {
  const n = p.pts.length;
  const out: Vertex[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const cur = p.pts[i]!;
    // The segment leaving `cur` in the reversed path is the one that arrived at
    // it in the original, i.e. the segment owned by the previous vertex.
    const prevIdx = (i - 1 + n) % n;
    const owner = p.closed || i > 0 ? p.pts[prevIdx]! : undefined;
    const b = owner?.bulge;
    out.push(b ? { x: cur.x, y: cur.y, bulge: -b } : { x: cur.x, y: cur.y });
  }
  return { pts: out, closed: p.closed };
}

/** Arc geometry implied by a bulge between two points. */
export interface ArcInfo {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean;
}

export function arcFromBulge(a: Vec2, b: Vec2, bulge: number): ArcInfo {
  const theta = 4 * Math.atan(bulge); // signed included angle
  const chord = dist(a, b);
  const r = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Distance from chord midpoint to centre, signed by sweep direction.
  const h = chord / 2 / Math.tan(theta / 2);
  const d = norm(sub(b, a));
  const nx = -d.y;
  const ny = d.x;
  const cx = mid.x + nx * h;
  const cy = mid.y + ny * h;
  return {
    cx,
    cy,
    r,
    startAngle: Math.atan2(a.y - cy, a.x - cx),
    endAngle: Math.atan2(b.y - cy, b.x - cx),
    ccw: theta > 0,
  };
}

/** Convert a bulge arc into line segments, at most `maxSagitta` off the true arc. */
export function tessellateArc(a: Vec2, b: Vec2, bulge: number, maxSagitta = 0.05): Vec2[] {
  const arc = arcFromBulge(a, b, bulge);
  const theta = Math.abs(4 * Math.atan(bulge));
  // Sagitta of a sub-arc of angle t on radius r is r * (1 - cos(t/2)).
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - maxSagitta / arc.r)));
  const steps = Math.max(2, Math.ceil(theta / Math.max(maxStep, 1e-3)));
  const out: Vec2[] = [];
  let sweep = arc.endAngle - arc.startAngle;
  if (arc.ccw && sweep <= 0) sweep += 2 * Math.PI;
  if (!arc.ccw && sweep >= 0) sweep -= 2 * Math.PI;
  for (let i = 1; i <= steps; i++) {
    const t = arc.startAngle + (sweep * i) / steps;
    out.push({ x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) });
  }
  return out;
}

/** Flatten a path to a polyline. The first point is included, the last is not repeated. */
export function tessellate(p: Path, maxSagitta = 0.05): Vec2[] {
  const n = p.pts.length;
  if (n === 0) return [];
  const out: Vec2[] = [{ x: p.pts[0]!.x, y: p.pts[0]!.y }];
  const segs = p.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = p.pts[i]!;
    const b = p.pts[(i + 1) % n]!;
    if (a.bulge) out.push(...tessellateArc(a, b, a.bulge, maxSagitta));
    else out.push({ x: b.x, y: b.y });
  }
  if (p.closed) out.pop(); // the closing point duplicates the first
  return out;
}

/**
 * Exact bounding box, including the parts of an arc that bulge past its
 * endpoints. Tessellating instead would under-report by up to the sagitta,
 * which is enough to make nested parts touch, so the arc extremes are solved
 * for directly.
 */
export function bboxOf(p: Path): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const n = p.pts.length;
  if (n === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (const q of p.pts) include(q.x, q.y);

  const segs = p.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = p.pts[i]!;
    if (!a.bulge) continue;
    const b = p.pts[(i + 1) % n]!;
    const arc = arcFromBulge(a, b, a.bulge);
    // The extreme of an arc in x or y is where it crosses a cardinal angle.
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      if (angleWithinSweep(ang, arc)) {
        include(arc.cx + arc.r * Math.cos(ang), arc.cy + arc.r * Math.sin(ang));
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const TAU2 = Math.PI * 2;
const wrap = (a: number): number => ((a % TAU2) + TAU2) % TAU2;

function angleWithinSweep(angle: number, arc: ArcInfo): boolean {
  const from = wrap(arc.startAngle);
  const to = wrap(arc.endAngle);
  const t = wrap(angle);
  const span = arc.ccw ? wrap(to - from) : wrap(from - to);
  const offset = arc.ccw ? wrap(t - from) : wrap(from - t);
  return offset <= span + 1e-12;
}

export function unionBox(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export const boxWidth = (b: Box): number => b.maxX - b.minX;
export const boxHeight = (b: Box): number => b.maxY - b.minY;

/** Signed area using the straight-segment approximation; positive means CCW. */
export function signedArea(p: Path): number {
  const pts = tessellate(p, 0.02);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]!;
    const r = pts[(i + 1) % pts.length]!;
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}

export const isCCW = (p: Path): boolean => signedArea(p) > 0;

export function ensureCCW(p: Path): Path {
  return isCCW(p) ? p : reversePath(p);
}

export function ensureCW(p: Path): Path {
  return isCCW(p) ? reversePath(p) : p;
}

/** Even-odd point-in-polygon test against the tessellated outline. */
export function pointInPath(p: Path, pt: Vec2): boolean {
  const pts = tessellate(p, 0.05);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > pt.y !== b.y > pt.y) {
      const xInt = ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
      if (pt.x < xInt) inside = !inside;
    }
  }
  return inside;
}

/** Turn direction at vertex i of a closed path: >0 left turn, <0 right turn. */
export function turnAt(p: Path, i: number): number {
  const n = p.pts.length;
  const prev = p.pts[(i - 1 + n) % n]!;
  const cur = p.pts[i]!;
  const next = p.pts[(i + 1) % n]!;
  return cross(sub(cur, prev), sub(next, cur));
}

export function pathLength(p: Path): number {
  const pts = tessellate(p, 0.05);
  let total = 0;
  const n = pts.length;
  const segs = p.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) total += dist(pts[i]!, pts[(i + 1) % n]!);
  return total;
}

export function samePoint(a: Vec2, b: Vec2, tol = 1e-6): boolean {
  return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
}

export { EPS };

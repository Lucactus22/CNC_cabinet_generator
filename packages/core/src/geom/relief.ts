import { ensureCCW, turnAt } from './path.js';
import { EPS, Path, Vec2, Vertex, cross, dot, norm, sub } from './types.js';

export type ReliefStyle = 'dogbone' | 'tbone' | 'none';

export interface ReliefOptions {
  /** Radius of the cutter that will machine this feature. */
  toolRadius: number;
  style: ReliefStyle;
  /**
   * How far the relief circle centre sits from the corner, as a fraction of the
   * tool radius. The classic value is 1/sqrt(2): far enough that the circle
   * comfortably covers the corner, close enough that the relief stays small.
   */
  offsetFactor?: number;
  /**
   * Relief is skipped at corners flatter than this. Every corner our joinery
   * generates is 90 degrees, so the default only exists to keep hand-authored
   * geometry sane.
   */
  maxAngleDeg?: number;
  /** For T-bones: which way to extend. 'auto' follows the longer adjacent edge. */
  tboneAxis?: 'auto' | 'prev' | 'next';
  /**
   * Which corners to treat as unreachable.
   *
   * 'convex' is for a female feature, where the path encloses the void: the
   * cutter cannot reach the sharp corners of the material poking into it.
   *
   * 'concave' is for a part outline, where the path encloses the material: the
   * cutter leaves a fillet in every inside corner, and on a tab root that
   * fillet is exactly what stops the shoulder seating flat.
   */
  corners?: 'convex' | 'concave';
}

const TAU = Math.PI * 2;

const normAngle = (a: number): number => ((a % TAU) + TAU) % TAU;

/**
 * Insert corner reliefs into a closed *female* path (a slot, mortise or pocket
 * boundary), so that a mating part with square corners can seat fully.
 *
 * The path encloses the void; material lies outside it. The corners that need
 * relief are therefore the convex corners of the enclosed region, since those
 * are where a round cutter leaves material behind.
 */
export function relieveCorners(path: Path, opts: ReliefOptions): Path {
  if (opts.style === 'none' || opts.toolRadius <= 0) return path;
  if (!path.closed || path.pts.length < 3) return path;

  const p = ensureCCW(path);
  const n = p.pts.length;
  const maxAngle = ((opts.maxAngleDeg ?? 179) * Math.PI) / 180;
  const out: Vertex[] = [];

  for (let i = 0; i < n; i++) {
    const cur = p.pts[i]!;
    const prev = p.pts[(i - 1 + n) % n]!;
    const next = p.pts[(i + 1) % n]!;

    // An arc on either side of the vertex means this corner is already a curve.
    const arcAdjacent = Boolean(prev.bulge) || Boolean(cur.bulge);
    // With the path counter-clockwise, a left turn is a convex corner of the
    // enclosed region and a right turn is a concave one.
    const turn = turnAt(p, i);
    const wanted = (opts.corners ?? 'convex') === 'convex' ? turn > EPS : turn < -EPS;

    if (arcAdjacent || !wanted) {
      out.push(cur);
      continue;
    }

    const u1 = norm(sub(prev, cur));
    const u2 = norm(sub(next, cur));
    const interior = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
    if (!isFinite(interior) || interior > maxAngle || interior < 1e-3) {
      out.push(cur);
      continue;
    }

    const relief =
      opts.style === 'dogbone'
        ? dogbone(cur, u1, u2, opts)
        : tbone(cur, u1, u2, prev, next, opts);

    if (relief) out.push(...relief);
    else out.push(cur);
  }

  return { pts: out, closed: true };
}

/** Where a ray from V along u crosses the relief circle centred at C, radius r. */
function rayCircleHit(V: Vec2, u: Vec2, C: Vec2, r: number): number | null {
  const d = sub(V, C);
  const b = dot(u, d);
  const c = dot(d, d) - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b + Math.sqrt(disc);
  return t > EPS ? t : null;
}

/**
 * Build the two vertices plus bulge that replace a corner with a relief loop
 * around centre C. Shared by both relief styles.
 */
function loopAround(V: Vec2, u1: Vec2, u2: Vec2, C: Vec2, r: number): Vertex[] | null {
  const t1 = rayCircleHit(V, u1, C, r);
  const t2 = rayCircleHit(V, u2, C, r);
  if (t1 === null || t2 === null) return null;

  const P1: Vec2 = { x: V.x + u1.x * t1, y: V.y + u1.y * t1 };
  const P2: Vec2 = { x: V.x + u2.x * t2, y: V.y + u2.y * t2 };

  // The far side of the circle, away from the corner: the arc has to pass
  // through here, otherwise we would cut a shortcut across the void instead of
  // a relief into the material.
  const away = norm(sub(C, V));
  const far: Vec2 = { x: C.x + away.x * r, y: C.y + away.y * r };

  const a1 = Math.atan2(P1.y - C.y, P1.x - C.x);
  const a2 = Math.atan2(P2.y - C.y, P2.x - C.x);
  const af = Math.atan2(far.y - C.y, far.x - C.x);

  const sweepCCW = normAngle(a2 - a1);
  const farOffset = normAngle(af - a1);
  const useCCW = farOffset < sweepCCW;
  const sweep = useCCW ? sweepCCW : TAU - sweepCCW;
  const bulge = (useCCW ? 1 : -1) * Math.tan(sweep / 4);

  // We arrive along the prev edge and leave along the next edge, so P1 comes
  // first and owns the arc.
  return [
    { x: P1.x, y: P1.y, bulge },
    { x: P2.x, y: P2.y },
  ];
}

/**
 * Dogbone: the relief circle sits on the corner bisector, pushed out into the
 * material, so it bites equally into both walls.
 */
function dogbone(V: Vec2, u1: Vec2, u2: Vec2, opts: ReliefOptions): Vertex[] | null {
  const r = opts.toolRadius;
  const s = clampFactor(opts.offsetFactor ?? Math.SQRT1_2);
  const bis = norm({ x: u1.x + u2.x, y: u1.y + u2.y });
  if (Math.hypot(bis.x, bis.y) < EPS) return null; // degenerate, edges are collinear
  const C: Vec2 = { x: V.x - bis.x * r * s, y: V.y - bis.y * r * s };
  return loopAround(V, u1, u2, C, r);
}

/**
 * T-bone: the relief circle slides along one wall, past the corner, so the
 * overcut is confined to a single direction and can be hidden by the mating
 * part's shoulder.
 */
function tbone(
  V: Vec2,
  u1: Vec2,
  u2: Vec2,
  prev: Vec2,
  next: Vec2,
  opts: ReliefOptions,
): Vertex[] | null {
  const r = opts.toolRadius;
  const s = clampFactor(opts.offsetFactor ?? Math.SQRT1_2);
  const axis = opts.tboneAxis ?? 'auto';
  // Extending along the longer adjacent edge keeps the overcut running down the
  // length of a slot rather than widening it, which is what you want in a
  // mortise: the width is the dimension that has to stay exact.
  const alongPrev =
    axis === 'prev' ||
    (axis === 'auto' && Math.hypot(prev.x - V.x, prev.y - V.y) >= Math.hypot(next.x - V.x, next.y - V.y));
  const u = alongPrev ? u1 : u2;
  const C: Vec2 = { x: V.x - u.x * r * s, y: V.y - u.y * r * s };
  return loopAround(V, u1, u2, C, r);
}

function clampFactor(f: number): number {
  // The circle must still cover the corner, so the centre has to stay strictly
  // inside one tool radius of it.
  return Math.max(0.05, Math.min(0.95, f));
}

/** Corners a round cutter cannot fully clear, by the same rule relieveCorners uses. */
export function findInsideCorners(
  path: Path,
  corners: 'convex' | 'concave' = 'convex',
): number[] {
  if (!path.closed) return [];
  const p = ensureCCW(path);
  const idx: number[] = [];
  for (let i = 0; i < p.pts.length; i++) {
    const n = p.pts.length;
    const prev = p.pts[(i - 1 + n) % n]!;
    const cur = p.pts[i]!;
    if (prev.bulge || cur.bulge) continue;
    const turn = turnAt(p, i);
    if (corners === 'convex' ? turn > EPS : turn < -EPS) idx.push(i);
  }
  return idx;
}

export { cross };

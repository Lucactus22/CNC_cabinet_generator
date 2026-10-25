import { bboxOf, ensureCCW, samePoint, tessellate, type Path, type Vec2 } from '../geom/index.js';

export interface Band {
  from: number;
  to: number;
  axis: 'x' | 'y';
}

/**
 * Trim an area — a pocket — to a tile.
 *
 * A path that falls wholly inside keeps its exact arcs. Only a path that
 * straddles the seam is flattened and clipped, and the flattening error is
 * bounded by the tessellation sagitta, well under anything a router resolves.
 *
 * The result is closed along the band's edge, so each tile clears its own
 * share of the area. CAM keeps the cutter a radius inside that edge, so two
 * shares meeting exactly at a seam leave a rib a cutter wide between them:
 * the caller widens the band past the seam by the cutter's width for the
 * tile before it (see `exportSheet`). It is never right for a profile, where
 * the closing edge would be a cut through the part — see `clipProfileToBand`.
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
 * Trim a profile — a part outline or a through cut — to a tile.
 *
 * A profile is a line the cutter follows, not an area it clears, so what
 * belongs to a tile is the stretch of that *line* inside it: open where it
 * meets a seam, never closed along it. Closing it the way a pocket is closed
 * would add a full-depth cut along the seam, and a side panel longer than one
 * tile would come off the machine in two pieces.
 *
 * Returns the path itself when it falls wholly inside, otherwise one open
 * piece per stretch. Every piece runs counter-clockwise round the original
 * contour, so what the contour encloses is always on the left of the direction
 * of travel — the one thing CAM needs to put the cutter on the right side of
 * an open profile, which it cannot infer the way it can for a closed one.
 */
export function clipProfileToBand(path: Path, band: Band): Path[] {
  const bb = bboxOf(path);
  const lo = band.axis === 'x' ? bb.minX : bb.minY;
  const hi = band.axis === 'x' ? bb.maxX : bb.maxY;

  if (lo >= band.from - 1e-9 && hi <= band.to + 1e-9) return [path];
  if (hi <= band.from + 1e-9 || lo >= band.to - 1e-9) return [];

  const pts = tessellate(path.closed ? ensureCCW(path) : path, 0.02);
  const n = pts.length;
  const segs = path.closed ? n : n - 1;
  const runs: Vec2[][] = [];
  let run: Vec2[] | null = null;
  for (let i = 0; i < segs; i++) {
    const piece = clipSegment(pts[i]!, pts[(i + 1) % n]!, band, path.closed);
    if (!piece) {
      run = null;
      continue;
    }
    if (run && samePoint(run[run.length - 1]!, piece[0])) run.push(piece[1]);
    else {
      run = [piece[0], piece[1]];
      runs.push(run);
    }
  }

  // The walk starts wherever the contour happens to start, which can be the
  // middle of a stretch: rejoin the two ends of it rather than handing CAM
  // one profile as two.
  if (path.closed && runs.length > 1) {
    const first = runs[0]!;
    const last = runs[runs.length - 1]!;
    if (samePoint(last[last.length - 1]!, first[0]!)) {
      runs[runs.length - 1] = [...last, ...first.slice(1)];
      runs.shift();
    }
  }

  return runs.map((r) => ({ pts: r.map((p) => ({ x: p.x, y: p.y })), closed: false }));
}

/**
 * The stretch of one straight segment inside a band, or null if none of it is.
 *
 * `ccw` says the segment belongs to a counter-clockwise contour, so the part
 * is on its left: that is what decides which tile owns an edge lying exactly
 * on a seam.
 */
function clipSegment(a: Vec2, b: Vec2, band: Band, ccw: boolean): [Vec2, Vec2] | null {
  const av = band.axis === 'x' ? a.x : a.y;
  const bv = band.axis === 'x' ? b.x : b.y;
  if (Math.abs(bv - av) < 1e-12) {
    if (av < band.from - 1e-9 || av > band.to + 1e-9) return null;
    const onFrom = Math.abs(av - band.from) < 1e-9;
    const onTo = Math.abs(av - band.to) < 1e-9;
    if (!onFrom && !onTo) return [a, b];
    // Running along the seam itself. Both tiles would claim it and nothing is
    // machined twice, so it goes to the tile the part is in: an edge with the
    // part above the seam is that part's near edge and opens the next tile;
    // one with the part below it closes this one. Owned by position alone, an
    // edge where a part starts exactly on a seam fell out of every tile.
    if (!ccw) return onTo || band.from <= 1e-9 ? [a, b] : null;
    const partAbove = band.axis === 'x' ? b.y < a.y : b.x > a.x;
    return (onFrom && partAbove) || (onTo && !partAbove) ? [a, b] : null;
  }
  const tFrom = (band.from - av) / (bv - av);
  const tTo = (band.to - av) / (bv - av);
  const t0 = Math.max(0, Math.min(tFrom, tTo));
  const t1 = Math.min(1, Math.max(tFrom, tTo));
  if (t1 - t0 < 1e-12) return null;
  const at = (t: number): Vec2 =>
    t === 0 ? a : t === 1 ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return [at(t0), at(t1)];
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

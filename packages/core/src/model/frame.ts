import type { AABB, Axis, LocalFrame, Part, Sign, Vec3 } from './types.js';

export type { LocalFrame };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const boxSize = (b: AABB): Vec3 => ({
  x: b.max.x - b.min.x,
  y: b.max.y - b.min.y,
  z: b.max.z - b.min.z,
});

export function boxesOverlap(a: AABB, b: AABB, tol = 1e-6): boolean {
  return (
    a.min.x < b.max.x - tol &&
    b.min.x < a.max.x - tol &&
    a.min.y < b.max.y - tol &&
    b.min.y < a.max.y - tol &&
    a.min.z < b.max.z - tol &&
    b.min.z < a.max.z - tol
  );
}

export function intersectBoxes(a: AABB, b: AABB): AABB | null {
  const min = {
    x: Math.max(a.min.x, b.min.x),
    y: Math.max(a.min.y, b.min.y),
    z: Math.max(a.min.z, b.min.z),
  };
  const max = {
    x: Math.min(a.max.x, b.max.x),
    y: Math.min(a.max.y, b.max.y),
    z: Math.min(a.max.z, b.max.z),
  };
  if (max.x < min.x || max.y < min.y || max.z < min.z) return null;
  return { min, max };
}

const AXES: Record<Axis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

const scaleV = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const negate = (a: Vec3): Vec3 => scaleV(a, -1);
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The local machining frame for a panel.
 *
 * `n` is the outward normal of the machined face. `u` and `v` are picked so
 * that (u, v, n) is right-handed, which is what makes a mirrored pair of side
 * panels come out as a genuine left and right rather than two of the same hand.
 */
export function localFrame(box: AABB, normalAxis: Axis, faceASign: Sign): LocalFrame {
  const n = faceASign === '+' ? AXES[normalAxis] : negate(AXES[normalAxis]);

  // Pick the two in-plane axes, then orient them so u x v = n.
  const inPlane: Axis[] =
    normalAxis === 'x' ? ['y', 'z'] : normalAxis === 'y' ? ['x', 'z'] : ['x', 'y'];
  const a0 = AXES[inPlane[0]!];
  const a1 = AXES[inPlane[1]!];
  const handed = dot3(cross3(a0, a1), n);
  const u = handed > 0 ? a0 : negate(a0);
  const v = a1;

  // Local (0, 0) is the corner of face A that is lowest in both u and v.
  const faceOffset = faceASign === '+' ? box.max : box.min;
  const corners = boxCorners(box).filter((c) => Math.abs(dot3(c, n) - dot3(faceOffset, n)) < 1e-9);
  let origin = corners[0]!;
  let best = Infinity;
  for (const c of corners) {
    const score = dot3(c, u) + dot3(c, v);
    if (score < best) {
      best = score;
      origin = c;
    }
  }
  return { u, v, n, origin };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function boxCorners(b: AABB): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min.x, b.max.x])
    for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push({ x, y, z });
  return out;
}

/** Project an assembly-space point into a panel's local 2D machining coordinates. */
export function toLocal(f: LocalFrame, p: Vec3): { x: number; y: number } {
  const d = { x: p.x - f.origin.x, y: p.y - f.origin.y, z: p.z - f.origin.z };
  return { x: dot3(d, f.u), y: dot3(d, f.v) };
}

/** Lift a local 2D point on face A back into assembly space. */
export function toAssembly(f: LocalFrame, x: number, y: number): Vec3 {
  return {
    x: f.origin.x + f.u.x * x + f.v.x * y,
    y: f.origin.y + f.u.y * x + f.v.y * y,
    z: f.origin.z + f.u.z * x + f.v.z * y,
  };
}

/**
 * A part's machining frame.
 *
 * Always the frame stored on the part, never a fresh derivation: by the time
 * anything asks, joinery has already grown captured panels into their grooves,
 * and rebuilding the frame from the enlarged box would silently offset the part
 * by one dado depth.
 */
export function frameOf(part: Part): LocalFrame {
  return part.frame;
}

/**
 * Project a box into a panel's local frame and return the covered 2D rectangle.
 * Used to work out exactly where a mating panel lands on a face.
 */
export function localRectOf(
  f: LocalFrame,
  box: AABB,
): { x: number; y: number; w: number; h: number } {
  const cs = boxCorners(box).map((c) => toLocal(f, c));
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export { dot3, cross3, boxCorners };

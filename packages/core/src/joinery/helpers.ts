import type { AABB, Axis, LocalRect, Part, Vec3 } from '../model/types.js';

export type { LocalRect };
import { frameOf, intersectBoxes, localRectOf, type LocalFrame } from '../model/frame.js';
import type { Corner, CornerNotch, Edge, EdgeTab } from '../geom/outline.js';

/** Mutable working copy of a part while joinery is being applied. */
export interface PartDraft {
  part: Part;
  frame: LocalFrame;
  /** The blank's rectangle in local coordinates, before tabs and notches. */
  base: LocalRect;
  /**
   * The same rectangle as first built, before any joint grew the panel into a
   * groove. That is exactly the area still on show once assembled.
   */
  exposed: LocalRect;
  notches: CornerNotch[];
  tabs: EdgeTab[];
}

const AXIS_VEC: Record<Axis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

export const centerOf = (b: AABB): Vec3 => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
  z: (b.min.z + b.max.z) / 2,
});

const comp = (v: Vec3, a: Axis): number => v[a];

export interface Contact {
  /** Whether the male sits above or below the female along the female's thickness axis. */
  maleSide: 'high' | 'low';
  /** Assembly coordinate of the female face the male lands on. */
  plane: number;
  /** Which machined face of the female that is. */
  side: 'A' | 'B';
  axis: Axis;
}

/** Work out which face of the female panel the male panel arrives at. */
export function contactOf(female: Part, male: Part): Contact {
  const axis = female.normalAxis;
  const fc = comp(centerOf(female.box), axis);
  const mc = comp(centerOf(male.box), axis);
  const maleSide: 'high' | 'low' = mc > fc ? 'high' : 'low';
  const plane = maleSide === 'high' ? comp(female.box.max, axis) : comp(female.box.min, axis);
  // Face A points along +axis when faceASign is '+', so it is the high face.
  const faceAIsHigh = female.faceASign === '+';
  const side: 'A' | 'B' = (maleSide === 'high') === faceAIsHigh ? 'A' : 'B';
  return { maleSide, plane, side, axis };
}

/** Grow the male panel so it reaches `depth` into the female. */
export function extendMaleInto(male: Part, c: Contact, depth: number): void {
  if (c.maleSide === 'high') male.box.min[c.axis] = c.plane - depth;
  else male.box.max[c.axis] = c.plane + depth;
}

/** The slab of female material that a groove of `depth` occupies. */
export function grooveSlab(female: Part, c: Contact, depth: number): AABB {
  const lo = { ...female.box.min };
  const hi = { ...female.box.max };
  if (c.maleSide === 'high') lo[c.axis] = c.plane - depth;
  else hi[c.axis] = c.plane + depth;
  return { min: lo, max: hi };
}

/** Where the male lands on the female, in the female's local machining coordinates. */
export function contactRect(
  female: Part,
  male: Part,
  c: Contact,
  depth: number,
  fFrame: LocalFrame,
): LocalRect | null {
  const overlap = intersectBoxes(male.box, grooveSlab(female, c, depth));
  if (!overlap) return null;
  const r = localRectOf(fFrame, overlap);
  return r.w <= 1e-6 || r.h <= 1e-6 ? null : r;
}

export interface AxisMap {
  which: 'u' | 'v';
  /** +1 when the local axis runs the same way as the assembly axis. */
  sign: 1 | -1;
}

/** Find which local axis of a frame carries a given assembly axis. */
export function mapAxis(frame: LocalFrame, axis: Axis): AxisMap | null {
  const a = AXIS_VEC[axis];
  const du = a.x * frame.u.x + a.y * frame.u.y + a.z * frame.u.z;
  const dv = a.x * frame.v.x + a.y * frame.v.y + a.z * frame.v.z;
  if (Math.abs(du) > 0.5) return { which: 'u', sign: du > 0 ? 1 : -1 };
  if (Math.abs(dv) > 0.5) return { which: 'v', sign: dv > 0 ? 1 : -1 };
  return null;
}

/**
 * Which edge of a part's blank faces a given assembly direction. Used to place
 * corner notches and tabs on the correct side of the panel.
 */
export function edgeFacing(frame: LocalFrame, dir: Vec3): Edge | null {
  const du = dir.x * frame.u.x + dir.y * frame.u.y + dir.z * frame.u.z;
  const dv = dir.x * frame.v.x + dir.y * frame.v.y + dir.z * frame.v.z;
  if (Math.abs(du) > Math.abs(dv)) {
    if (Math.abs(du) < 0.5) return null;
    return du > 0 ? 'right' : 'left';
  }
  if (Math.abs(dv) < 0.5) return null;
  return dv > 0 ? 'top' : 'bottom';
}

/** The corner shared by two perpendicular edges. */
export function cornerBetween(a: Edge, b: Edge): Corner | null {
  const has = (e: Edge): boolean => a === e || b === e;
  if (has('left') && has('bottom')) return 'll';
  if (has('right') && has('bottom')) return 'lr';
  if (has('right') && has('top')) return 'ur';
  if (has('left') && has('top')) return 'ul';
  return null;
}

export const isVerticalEdge = (e: Edge): boolean => e === 'left' || e === 'right';

/** Assembly-space direction pointing from the male panel toward the female. */
export function dirToFemale(c: Contact): Vec3 {
  const v: Vec3 = { x: 0, y: 0, z: 0 };
  v[c.axis] = c.maleSide === 'high' ? -1 : 1;
  return v;
}

export const FRONT_DIR: Vec3 = { x: 0, y: -1, z: 0 };

export function makeDraft(part: Part): PartDraft {
  const frame = frameOf(part);
  // The frame is fixed here and never recomputed, so local coordinates stay
  // comparable even after joinery grows the box.
  const base = localRectOf(frame, part.box);
  return { part, frame, base, exposed: { ...base }, notches: [], tabs: [] };
}

/** Recompute the blank rectangle after the box has been grown into its joints. */
export function refreshBase(d: PartDraft): void {
  d.base = localRectOf(d.frame, d.part.box);
}

export { frameOf };

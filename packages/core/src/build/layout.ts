import type { CarcassSpec } from '../model/types.js';

export interface BayRange {
  /** Clear opening, between the faces that bound it. */
  x0: number;
  x1: number;
  index: number;
}

export interface BayLayout {
  bays: BayRange[];
  /** Left face of each divider. */
  dividerX: number[];
  /** Set when explicit widths did not add up and an even split was used instead. */
  fellBackToEven: boolean;
}

/**
 * Split a carcass into bays. Explicit widths are clear openings and are used
 * as given when they fit; otherwise the interior is divided evenly.
 */
export function layoutBays(spec: CarcassSpec, t: number): BayLayout {
  const n = Math.max(0, Math.floor(spec.dividerCount));
  const bayCount = n + 1;
  const interior = spec.width - 2 * t;
  const available = interior - n * t;

  let widths: number[];
  let fellBackToEven = false;
  const explicit = spec.bayWidths.filter((w) => w > 0);
  if (explicit.length === bayCount && Math.abs(sum(explicit) - available) < 0.5) {
    widths = explicit.slice();
  } else {
    fellBackToEven = explicit.length > 0;
    widths = new Array(bayCount).fill(available / bayCount);
  }

  const bays: BayRange[] = [];
  const dividerX: number[] = [];
  let x = t;
  for (let i = 0; i < bayCount; i++) {
    const w = widths[i]!;
    bays.push({ x0: x, x1: x + w, index: i });
    x += w;
    if (i < bayCount - 1) {
      dividerX.push(x);
      x += t;
    }
  }
  return { bays, dividerX, fellBackToEven };
}

/**
 * Evenly space `count` fixed shelves in a clear vertical opening, returning the
 * bottom face height of each.
 */
export function shelfHeights(z0: number, z1: number, count: number, t: number): number[] {
  if (count <= 0) return [];
  const gap = (z1 - z0 - count * t) / (count + 1);
  const out: number[] = [];
  let z = z0;
  for (let i = 0; i < count; i++) {
    z += gap;
    out.push(z);
    z += t;
  }
  return out;
}

/** Shelf pin hole heights under the 32 mm system, snapped to the pitch. */
export function pinHeights(
  z0: number,
  z1: number,
  spec: {
    pitch: number;
    startAbove: number;
    endBelow: number;
  },
): number[] {
  const lo = z0 + spec.startAbove;
  const hi = z1 - spec.endBelow;
  if (hi <= lo || spec.pitch <= 0) return [];
  const out: number[] = [];
  // Anchor the ladder to the bottom of the opening so both sides of a bay, and
  // both rows on a side, always line up.
  const first = z0 + Math.ceil((lo - z0) / spec.pitch) * spec.pitch;
  for (let z = first; z <= hi + 1e-9; z += spec.pitch) out.push(z);
  return out;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Screw positions along a hanging rail.
 *
 * Held in from both ends so a screw is never driven at the rail's tip, at
 * least two so the cabinet always has something to hang from even if a stud
 * is missed, and never more than `spacing` apart — kept under a stud's typical
 * 16 in (406 mm) spacing so a run of any width still crosses at least two.
 */
export function wallMountXs(x0: number, x1: number, spacing: number): number[] {
  const inset = Math.min(60, (x1 - x0) / 4);
  const usable = x1 - x0 - 2 * inset;
  if (usable <= 0) return [(x0 + x1) / 2];
  // A non-positive spacing is a bad value, not an instruction to hang the
  // cabinet on one screw: fall back to the minimum instead of letting it
  // defeat the "at least two" guarantee below.
  const pitch = spacing > 0 ? spacing : usable;
  // Ceiling, not rounding: rounding down would let one gap land past the
  // spacing limit the caller asked to stay under.
  const count = Math.max(2, Math.ceil(usable / pitch) + 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(x0 + inset + (usable * i) / (count - 1));
  return out;
}

/**
 * Cup centre heights for a door.
 *
 * Two hinges hold a door up to about 900 mm; past that the trade rule is one
 * more per 600-odd millimetres. The end pair sit a fixed distance in from each
 * end and any others are spread evenly between them.
 */
export function hingeHeights(z0: number, z1: number, endOffset: number): number[] {
  const height = z1 - z0;
  if (height <= 0) return [];
  if (height < endOffset * 2 + 20) return [(z0 + z1) / 2];

  const count = height <= 900 ? 2 : height <= 1600 ? 3 : height <= 2100 ? 4 : 5;
  const first = z0 + endOffset;
  const last = z1 - endOffset;
  if (count === 2) return [first, last];

  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(first + ((last - first) * i) / (count - 1));
  return out;
}

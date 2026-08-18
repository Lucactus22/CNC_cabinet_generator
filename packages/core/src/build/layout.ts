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
export function pinHeights(z0: number, z1: number, spec: {
  pitch: number;
  startAbove: number;
  endBelow: number;
}): number[] {
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

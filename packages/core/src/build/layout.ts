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

export interface ShelfLayout {
  /** Bottom face height of each fixed shelf, lowest first. */
  zs: number[];
  /** Set when explicit gaps did not add up and an even split was used instead. */
  fellBackToEven: boolean;
}

/**
 * Stack `count` fixed shelves up a clear vertical opening.
 *
 * The exact mirror of `layoutBays`, one axis round: `gaps` are the clear
 * openings between the shelves, bottom to top, and there is one more of them
 * than there are shelves. Given ones that fit they are used as they stand;
 * anything else is split evenly, because a stack of equal shelves you can cut
 * beats one sized to numbers that do not reach the top of the box.
 */
export function layoutShelves(
  z0: number,
  z1: number,
  count: number,
  t: number,
  gaps: number[] = [],
): ShelfLayout {
  if (count <= 0) return { zs: [], fellBackToEven: false };
  const available = z1 - z0 - count * t;

  let heights: number[];
  let fellBackToEven = false;
  const explicit = gaps.filter((g) => g > 0);
  if (explicit.length === count + 1 && Math.abs(sum(explicit) - available) < 0.5) {
    heights = explicit.slice();
  } else {
    fellBackToEven = explicit.length > 0;
    heights = new Array(count + 1).fill(available / (count + 1));
  }

  const zs: number[] = [];
  let z = z0;
  for (let i = 0; i < count; i++) {
    z += heights[i]!;
    zs.push(z);
    z += t;
  }
  return { zs, fellBackToEven };
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

export interface RestingShelves {
  /** Bottom face height of each loose shelf, lowest first. */
  zs: number[];
  /** How many of the requested shelves the ladder had room for. */
  placed: number;
}

/**
 * Seat `count` loose shelves on a pin ladder, spread as evenly as the holes
 * allow.
 *
 * A loose shelf can only rest where there is a hole, so the even spacing
 * `layoutShelves` gives a fixed shelf is only a target here: each shelf takes
 * the pin nearest its ideal height. Two shelves never share a pin, and each is
 * kept a full shelf thickness clear of the one below — otherwise a pair would
 * be drawn passing through each other in the model and could not be loaded in
 * the cabinet. When the ladder is too short for all of them, fewer are placed
 * and the caller says so; a shelf quietly left off is the failure to avoid.
 *
 * `zs` is the hole's centre height, so a modelled shelf sits about a pin radius
 * below where the pin would actually hold it — drawing only, nothing exported.
 */
export function restShelvesOnPins(
  pins: number[],
  z1: number,
  count: number,
  t: number,
  z0: number,
): RestingShelves {
  if (count <= 0 || pins.length === 0) return { zs: [], placed: 0 };
  const usable = pins.filter((p) => p + t <= z1 + 1e-9);
  if (usable.length === 0) return { zs: [], placed: 0 };

  const pitch = pins.length > 1 ? pins[1]! - pins[0]! : t;
  const step = Math.max(pitch, Math.ceil(t / pitch - 1e-9) * pitch);
  const top = usable[usable.length - 1]!;
  const fit = Math.max(1, Math.min(count, Math.floor((top - usable[0]!) / step + 1e-9) + 1));

  const gap = (z1 - z0 - fit * t) / (fit + 1);
  const zs: number[] = [];
  for (let k = 0; k < fit; k++) {
    const ideal = z0 + (k + 1) * gap + k * t;
    const lowest = k === 0 ? -Infinity : zs[k - 1]! + step - 1e-9;
    const highest = top - (fit - 1 - k) * step + 1e-9;
    const options = usable.filter((p) => p >= lowest && p <= highest);
    const pick = options.reduce(
      (best, p) => (Math.abs(p - ideal) < Math.abs(best - ideal) ? p : best),
      options[0] ?? usable[0]!,
    );
    zs.push(pick);
  }
  return { zs, placed: fit };
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Resolve a drawer stack's explicit front heights against the opening they
 * have to fill, falling back to an even split the same way `layoutBays` does
 * for bay widths that do not add up: better a stack of equal, cuttable
 * drawers than one sized to numbers that do not actually reach.
 *
 * The heights are the fronts themselves. They add up the way a door beside
 * them does: the fronts, a reveal between each, and the door's own gap at the
 * top and the bottom of the stack — `end`, half a reveal under overlay and
 * the inset gap under inset. Leaving `end` out, as this once did, cut every
 * front a reveal short and left the stack's bottom edge a reveal higher than
 * the door beside it for every drawer below the first.
 */
export function drawerHeights(
  available: number,
  explicit: number[],
  reveal: number,
  end: number,
): { heights: number[]; fellBackToEven: boolean; bottomTrimmed: number } {
  const n = explicit.length;
  if (n === 0) return { heights: [], fellBackToEven: false, bottomTrimmed: 0 };
  const gaps = (n - 1) * reveal + 2 * end;
  if (Math.abs(sum(explicit) + gaps - available) < 0.5)
    return { heights: explicit.slice(), fellBackToEven: false, bottomTrimmed: 0 };
  // A stack typed to 1.0's rule — no gap at the top and bottom — is the same
  // design, the two end gaps over. Throwing every height away for an even
  // split would cut a different chest of drawers from a project that has not
  // changed; taking the difference off the bottom front keeps the design and
  // lines it up with the door beside it.
  const last = explicit[n - 1]!;
  if (Math.abs(sum(explicit) + (n - 1) * reveal - available) < 0.5 && last - 2 * end > 0) {
    const heights = explicit.slice();
    heights[n - 1] = last - 2 * end;
    return { heights, fellBackToEven: false, bottomTrimmed: 2 * end };
  }
  const each = Math.max(0, (available - gaps) / n);
  return { heights: new Array(n).fill(each), fellBackToEven: true, bottomTrimmed: 0 };
}

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

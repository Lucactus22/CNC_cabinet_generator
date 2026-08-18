export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement extends Rect {
  rotated: boolean;
}

/**
 * Keeps placements from straddling the seams between machine tiles.
 *
 * Boundaries fall wherever `(x + phase)` is a multiple of `period`. A part
 * wider than a whole band has to cross a seam and is allowed through; anything
 * that would fit inside one band is held to it.
 */
export interface BandConstraint {
  period: number;
  phase: number;
}

/**
 * MaxRects bin packing, Best-Area-Fit.
 *
 * Every part a cabinet generates is a rectangle, so packing bounding boxes is
 * both the right model and fast enough to re-run on every parameter change.
 * Placement is deterministic, which matters more than it sounds: the preview
 * must not reshuffle itself while a slider is being dragged.
 */
export class MaxRectsBin {
  readonly width: number;
  readonly height: number;
  private free: Rect[];
  readonly used: Placement[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /** Try to place a w x h part. Returns null when it will not fit. */
  insert(
    w: number,
    h: number,
    allowRotate: boolean,
    bands?: BandConstraint,
  ): Placement | null {
    const spot = this.findSpot(w, h, allowRotate, bands);
    if (!spot) return null;

    const stale = this.free.filter((f) => overlaps(f, spot));
    this.free = this.free.filter((f) => !overlaps(f, spot));
    for (const f of stale) this.free.push(...splitFree(f, spot));
    this.prune();

    this.used.push(spot);
    return spot;
  }

  /** Fraction of the bin covered by placed parts. */
  usedArea(): number {
    return this.used.reduce((a, p) => a + p.w * p.h, 0);
  }

  private findSpot(
    w: number,
    h: number,
    allowRotate: boolean,
    bands?: BandConstraint,
  ): Placement | null {
    let best: Placement | null = null;
    let bestBand = Infinity;
    let bestArea = Infinity;
    let bestShort = Infinity;

    for (const f of this.free) {
      const tries: Array<[number, number, boolean]> = [[w, h, false]];
      if (allowRotate && w !== h) tries.push([h, w, true]);

      for (const [pw, ph, rotated] of tries) {
        if (pw > f.w + 1e-9 || ph > f.h + 1e-9) continue;

        // Free rectangles only ever begin at the edge of something already
        // placed, so without this a part could never start exactly on a band
        // boundary and would be rejected for straddling instead of simply
        // moving into the next band.
        const xs = [f.x];
        if (bands) {
          const next = nextBoundary(f.x, bands);
          if (next > f.x + 1e-9 && next + pw <= f.x + f.w + 1e-9) xs.push(next);
        }

        for (const x of xs) {
          if (bands && straddles(x, pw, bands)) continue;

          // Filling the earliest band first is what actually reduces the
          // number of setups, so it outranks how tightly the part fits.
          const band = bands ? bandIndex(x, bands) : 0;
          // Best-Area-Fit: leave the smallest offcut, breaking ties on the
          // shorter leftover side so slivers do not accumulate.
          const waste = f.w * f.h - pw * ph + (x - f.x) * ph;
          const short = Math.min(f.x + f.w - x - pw, f.h - ph);

          const better =
            band < bestBand - 1e-9 ||
            (Math.abs(band - bestBand) < 1e-9 &&
              (waste < bestArea - 1e-9 ||
                (Math.abs(waste - bestArea) < 1e-9 && short < bestShort)));
          if (better) {
            bestBand = band;
            bestArea = waste;
            bestShort = short;
            best = { x, y: f.y, w: pw, h: ph, rotated };
          }
        }
      }
    }
    return best;
  }

  private prune(): void {
    // Drop any free rectangle wholly inside another; MaxRects generates plenty.
    const keep: Rect[] = [];
    for (let i = 0; i < this.free.length; i++) {
      const a = this.free[i]!;
      if (a.w <= 1e-9 || a.h <= 1e-9) continue;
      let contained = false;
      for (let j = 0; j < this.free.length; j++) {
        if (i === j) continue;
        if (contains(this.free[j]!, a)) {
          // Identical rectangles would otherwise eat each other.
          if (!contains(a, this.free[j]!) || j < i) {
            contained = true;
            break;
          }
        }
      }
      if (!contained) keep.push(a);
    }
    this.free = keep;
  }
}

export const bandIndex = (x: number, b: BandConstraint): number =>
  Math.floor((x + b.phase) / b.period + 1e-9);

/** The first band boundary strictly past x. */
export const nextBoundary = (x: number, b: BandConstraint): number =>
  (bandIndex(x, b) + 1) * b.period - b.phase;

/** Whether a part at x of width w would cross a seam it could have avoided. */
export function straddles(x: number, w: number, b: BandConstraint): boolean {
  // Anything wider than a band has no choice, so it is never rejected.
  if (w > b.period + 1e-9) return false;
  return bandIndex(x, b) !== bandIndex(x + w - 1e-6, b);
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9;

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
  inner.y + inner.h <= outer.y + outer.h + 1e-9;

/** Carve a placed rectangle out of a free one, leaving up to four strips. */
function splitFree(f: Rect, used: Rect): Rect[] {
  const out: Rect[] = [];
  if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
  if (used.x + used.w < f.x + f.w) {
    const x = used.x + used.w;
    out.push({ x, y: f.y, w: f.x + f.w - x, h: f.h });
  }
  if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
  if (used.y + used.h < f.y + f.h) {
    const y = used.y + used.h;
    out.push({ x: f.x, y, w: f.w, h: f.y + f.h - y });
  }
  return out.filter((r) => r.w > 1e-9 && r.h > 1e-9);
}

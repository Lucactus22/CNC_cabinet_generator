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
  insert(w: number, h: number, allowRotate: boolean): Placement | null {
    const spot = this.findSpot(w, h, allowRotate);
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

  private findSpot(w: number, h: number, allowRotate: boolean): Placement | null {
    let best: Placement | null = null;
    let bestArea = Infinity;
    let bestShort = Infinity;

    for (const f of this.free) {
      const tries: Array<[number, number, boolean]> = [[w, h, false]];
      if (allowRotate && w !== h) tries.push([h, w, true]);

      for (const [pw, ph, rotated] of tries) {
        if (pw > f.w + 1e-9 || ph > f.h + 1e-9) continue;
        // Best-Area-Fit: leave the smallest offcut, breaking ties on the
        // shorter leftover side so slivers do not accumulate.
        const area = f.w * f.h - pw * ph;
        const short = Math.min(f.w - pw, f.h - ph);
        if (area < bestArea - 1e-9 || (Math.abs(area - bestArea) < 1e-9 && short < bestShort)) {
          bestArea = area;
          bestShort = short;
          best = { x: f.x, y: f.y, w: pw, h: ph, rotated };
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

import type { BandConstraint, Placement, Rect } from './maxrects.js';

/**
 * Guillotine bin packing, Best-Area-Fit.
 *
 * MaxRects will happily place a part in a pocket that only exists because two
 * unrelated earlier cuts left a matching gap — exact for a router, which
 * mills each part's own outline regardless of what is next to it, but not
 * something a panel saw can produce: every cut on a saw runs the full width
 * or height of whatever offcut is currently on the table. This packer only
 * ever grows a layout by taking one still-whole free rectangle and splitting
 * it with a single full-length cut, so by construction the result can always
 * be recovered by a sequence of straight cuts, outermost first.
 *
 * That constraint costs yield next to MaxRects — a real trade, not a bug —
 * which is why it is offered as a separate strategy rather than replacing it.
 */
export class GuillotineBin {
  readonly width: number;
  readonly height: number;
  private free: Rect[];
  readonly used: Placement[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /**
   * Try to place a w x h part. Returns null when it will not fit.
   *
   * `bands` is accepted only so this can stand in for `MaxRectsBin` at the
   * nester's call site: tile setups are a CNC router's concern, and a panel
   * saw has no bed limit for this to matter to, so it is never read.
   */
  insert(w: number, h: number, allowRotate: boolean, _bands?: BandConstraint): Placement | null {
    let bestIndex = -1;
    let best: Placement | null = null;
    let bestWaste = Infinity;

    for (let i = 0; i < this.free.length; i++) {
      const f = this.free[i]!;
      const tries: Array<[number, number, boolean]> = [[w, h, false]];
      if (allowRotate && w !== h) tries.push([h, w, true]);

      for (const [pw, ph, rotated] of tries) {
        if (pw > f.w + 1e-9 || ph > f.h + 1e-9) continue;
        // Best-Area-Fit: leave the smallest offcut behind.
        const waste = f.w * f.h - pw * ph;
        if (waste < bestWaste - 1e-9) {
          bestWaste = waste;
          best = { x: f.x, y: f.y, w: pw, h: ph, rotated };
          bestIndex = i;
        }
      }
    }
    if (!best || bestIndex < 0) return null;

    const f = this.free[bestIndex]!;
    this.free.splice(bestIndex, 1);
    this.free.push(...guillotineSplit(f, best));

    this.used.push(best);
    return best;
  }

  /** Fraction of the bin covered by placed parts. */
  usedArea(): number {
    return this.used.reduce((a, p) => a + p.w * p.h, 0);
  }

  /**
   * Free rectangles left once every part has been placed.
   *
   * Unlike MaxRects's, these never overlap: each split cleanly partitions its
   * parent, so the free list stays a disjoint covering of whatever the sheet
   * has left, safe to report directly as offcuts.
   */
  freeRects(): readonly Rect[] {
    return this.free;
  }
}

/**
 * Split a free rectangle around a placed piece with one full-length cut, so
 * every offcut it leaves behind can still be freed with one more straight
 * cut — the guarantee MaxRects's four-way split does not make.
 *
 * There are two ways to make that cut: across the piece's own width, or
 * across its own height. Whichever leaves the two remainders closest in area
 * is kept, so neither degenerates into a sliver nothing else will fit — the
 * same reasoning as Best-Area-Fit, applied to the cut instead of the
 * placement.
 */
function guillotineSplit(f: Rect, used: Rect): Rect[] {
  const rightW = f.w - used.w;
  const topH = f.h - used.h;

  // Cut the full width off above the piece, leaving a strip beside it.
  const acrossTop: Rect[] = [];
  if (rightW > 1e-9) acrossTop.push({ x: f.x + used.w, y: f.y, w: rightW, h: used.h });
  if (topH > 1e-9) acrossTop.push({ x: f.x, y: f.y + used.h, w: f.w, h: topH });

  // Cut the full height off beside the piece, leaving a strip above it.
  const acrossSide: Rect[] = [];
  if (topH > 1e-9) acrossSide.push({ x: f.x, y: f.y + used.h, w: used.w, h: topH });
  if (rightW > 1e-9) acrossSide.push({ x: f.x + used.w, y: f.y, w: rightW, h: f.h });

  const spread = (rects: Rect[]): number => {
    if (rects.length < 2) return 0;
    const areas = rects.map((r) => r.w * r.h);
    return Math.max(...areas) - Math.min(...areas);
  };

  const chosen = spread(acrossTop) <= spread(acrossSide) ? acrossTop : acrossSide;
  return chosen.filter((r) => r.w > 1e-9 && r.h > 1e-9);
}

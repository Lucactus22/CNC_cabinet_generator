import type { DoorFit } from '../model/types.js';

/**
 * The rectangle a door leaf is fitted to, and how far an overlay door may
 * extend past it.
 *
 * A frameless carcass and a face frame produce this the same shape but from
 * different numbers — a frameless opening overlays the full thickness of
 * whatever panel is there, a face-frame opening overlays a modest reveal onto
 * the surrounding stile or rail — and door layout never has to know which one
 * it was handed. That is the whole point of R-07's opening abstraction: the
 * branch on construction style lives where the opening is built, not in how a
 * door is cut from it.
 */
export interface FrontOpening {
  /** Clear opening: an inset door sits here, less its own gap. */
  clearX0: number;
  clearX1: number;
  clearZ0: number;
  clearZ1: number;
  /** Outermost an overlay door may reach on each edge, before its own reveal is subtracted. */
  overlayX0: number;
  overlayX1: number;
  overlayZ0: number;
  overlayZ1: number;
}

export interface DoorRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * A door leaf's box, from the opening it fills and how it is meant to fit.
 *
 * Pure geometry, on purpose: everything about *which* numbers an opening
 * carries — full overlay onto a thin carcass side, partial overlay onto a
 * wide stile — is decided before this is called, so this function itself
 * never needs to ask what it is fitted to.
 */
export function doorLeafRect(
  o: FrontOpening,
  fit: DoorFit,
  reveal: number,
  insetGap: number,
): DoorRect {
  if (fit === 'overlay') {
    return {
      x0: o.overlayX0 + reveal / 2,
      x1: o.overlayX1 - reveal / 2,
      z0: o.overlayZ0 + reveal / 2,
      z1: o.overlayZ1 - reveal / 2,
    };
  }
  return {
    x0: o.clearX0 + insetGap,
    x1: o.clearX1 - insetGap,
    z0: o.clearZ0 + insetGap,
    z1: o.clearZ1 - insetGap,
  };
}

/**
 * Slice one opening into a vertical stack of smaller openings, top to bottom
 * — what a stack of drawer fronts asks of a bay a single door would
 * otherwise fill whole, each slice then run through `doorLeafRect` exactly
 * as a door's own opening would be.
 *
 * `heights` are the fronts themselves, already resolved by `drawerHeights`
 * to add up. Each slice is its front plus the gap `doorLeafRect` takes back
 * off it — half a reveal each side under overlay, the inset gap under inset —
 * and the fronts are a reveal apart, the same as the two leaves of a pair of
 * doors. So the top front starts where a door's top edge would, and the
 * bottom one ends where a door's bottom edge would.
 *
 * Only the Z-span `fit` actually reads is sliced; the other one is split
 * evenly between the same slices. `doorLeafRect` never reads it for that fit,
 * and there is no fixed offset between a frameless opening's clear and
 * overlay spans to derive one span's slices from the other's — overlay runs
 * the full height between the toe kick and the underside of the top, clear
 * only the bay's own interior.
 */
export function splitOpeningVertically(
  o: FrontOpening,
  heights: number[],
  fit: DoorFit,
  reveal: number,
  insetGap: number,
): FrontOpening[] {
  const n = heights.length;
  const end = fit === 'overlay' ? reveal / 2 : insetGap;
  const evenClear = (o.clearZ1 - o.clearZ0) / n;
  const evenOverlay = (o.overlayZ1 - o.overlayZ0) / n;
  const out: FrontOpening[] = [];
  // The top edge of the next front, in the span this fit reads.
  let frontTop = (fit === 'overlay' ? o.overlayZ1 : o.clearZ1) - end;
  heights.forEach((h, k) => {
    const sliceTop = frontTop + end;
    const sliceBottom = frontTop - h - end;
    const evenTop = (span1: number, each: number): number => span1 - k * each;
    out.push({
      clearX0: o.clearX0,
      clearX1: o.clearX1,
      clearZ0: fit === 'inset' ? sliceBottom : evenTop(o.clearZ1, evenClear) - evenClear,
      clearZ1: fit === 'inset' ? sliceTop : evenTop(o.clearZ1, evenClear),
      overlayX0: o.overlayX0,
      overlayX1: o.overlayX1,
      overlayZ0: fit === 'overlay' ? sliceBottom : evenTop(o.overlayZ1, evenOverlay) - evenOverlay,
      overlayZ1: fit === 'overlay' ? sliceTop : evenTop(o.overlayZ1, evenOverlay),
    });
    frontTop -= h + reveal;
  });
  return out;
}

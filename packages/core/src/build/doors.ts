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

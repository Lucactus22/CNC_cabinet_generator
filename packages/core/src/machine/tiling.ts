import type { CabinetParams, MachineSpec } from '../model/types.js';

export interface Tile {
  index: number;
  /** Cut region along the feed axis. Geometry outside this is left for other tiles. */
  from: number;
  to: number;
}

export interface TilePlan {
  axis: 'x' | 'y';
  tiles: Tile[];
  /** How far the stock advances between tiles. */
  step: number;
  /** Feed-axis positions of the registration hole pairs. */
  registrationX: number[];
  registrationY: number[];
  holeDiameter: number;
}

/**
 * Split a sheet that is longer than the machine into feed-through tiles.
 *
 * Each tile cuts a band exactly `step` wide, where step is the machine's travel
 * less the overlap. The overlap is headroom, not double-cutting: nothing is
 * machined twice, and no cut lands at the very limit of travel.
 *
 * Registration holes are spaced one step apart, so after the stock slides
 * forward the previous tile's holes land on the same pins.
 */
export function planTiles(
  sheetLength: number,
  sheetWidth: number,
  machine: MachineSpec,
  sheetMargin: number,
): TilePlan | null {
  if (machine.tilingAxis === 'none') return null;
  const travel = machine.tilingAxis === 'x' ? machine.travelX : machine.travelY;
  const step = travel - machine.tileOverlap;
  if (step <= 0) return null;
  if (sheetLength <= travel + 1e-9) return null; // one setup covers it

  const count = Math.ceil(sheetLength / step);
  const tiles: Tile[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({ index: i, from: i * step, to: Math.min((i + 1) * step, sheetLength) });
  }

  // Two holes per seam, out in the waste margin at each edge of the sheet.
  const registrationX: number[] = [];
  for (let i = 1; i < count; i++) registrationX.push(i * step);
  const inset = Math.max(sheetMargin / 2, machine.registrationHoleDiameter);
  const registrationY = [inset, sheetWidth - inset];

  return {
    axis: machine.tilingAxis,
    tiles,
    step,
    registrationX,
    registrationY,
    holeDiameter: machine.registrationHoleDiameter,
  };
}

export function tileCountFor(params: CabinetParams, sheetLength: number): number {
  const m = params.machine;
  if (m.tilingAxis === 'none') return 1;
  const travel = m.tilingAxis === 'x' ? m.travelX : m.travelY;
  const step = travel - m.tileOverlap;
  if (step <= 0 || sheetLength <= travel) return 1;
  return Math.ceil(sheetLength / step);
}

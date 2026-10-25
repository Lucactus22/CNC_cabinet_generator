import type { Feature, MachineSpec, Part, ProjectParams } from '../model/types.js';
import type { NestedSheet } from '../nest/index.js';

/**
 * Whether a feature is cut after the sheet is turned over, onto a _FLIP layer.
 *
 * A through cut or a through hole goes right through, so it is cut from
 * whichever face is up; everything else on face B waits for the turn.
 */
export function cutAfterTurning(f: Feature): boolean {
  if (f.kind === 'through') return false;
  if (f.kind === 'drill' && f.depth === 'thru') return false;
  return f.side === 'B';
}

/**
 * How far along the stock a sheet's machining reaches — what its tiles have to
 * cover.
 *
 * Usually that is where the parts stop. But turning a sheet over left to right
 * puts a part's second face at the far end of the blank: a divider nested at
 * the start of a half-filled sheet has its second-face housings cut near the
 * end of it. Tiling only as far as the parts reach on the first face would
 * leave that work outside every tile, and the tile files would silently be
 * missing it.
 */
export function machiningReach(sheet: NestedSheet, parts: Part[]): number {
  const turned = new Set(parts.filter((p) => p.features.some(cutAfterTurning)).map((p) => p.id));
  let reach = sheet.contentLength;
  for (const placed of sheet.parts) {
    if (turned.has(placed.partId)) reach = Math.max(reach, sheet.length - placed.x);
  }
  return reach;
}

export interface Tile {
  index: number;
  /** Cut region along the feed axis. Geometry outside this is left for other tiles. */
  from: number;
  to: number;
}

export interface TilePlan {
  /**
   * Always the sheet's own long axis: the stock is loaded with its length
   * running along whichever machine axis feeds through.
   */
  axis: 'x';
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
  const step = feedStep(machine);
  if (step === null) return null;
  const travel = feedTravel(machine);
  // `sheetLength` is how far the machining actually reaches (`machiningReach`),
  // not the blank's nominal size: a sheet only half filled needs only the
  // setups that cover it.
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
    axis: 'x',
    tiles,
    step,
    registrationX,
    registrationY,
    holeDiameter: machine.registrationHoleDiameter,
  };
}

export function tileCountFor(params: ProjectParams, sheetLength: number): number {
  const m = params.machine;
  if (m.tilingAxis === 'none') return 1;
  const step = feedStep(m);
  if (step === null || sheetLength <= feedTravel(m)) return 1;
  return Math.ceil(sheetLength / step);
}

/** Travel available on the axis the stock feeds along. */
export const feedTravel = (m: MachineSpec): number =>
  m.tilingAxis === 'y' ? m.travelY : m.travelX;

/** How far the stock advances between tiles, or null if it never could. */
export function feedStep(m: MachineSpec): number | null {
  if (m.tilingAxis === 'none') return null;
  const step = feedTravel(m) - m.tileOverlap;
  return step > 0 ? step : null;
}

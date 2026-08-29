import { mapAxis, type AxisMap } from '../joinery/helpers.js';
import type { LocalFrame } from '../model/frame.js';

/**
 * Turning assembly-space planes into the flat coordinates a hole is drilled at.
 *
 * Both boring routines need the same two moves — find where an assembly plane
 * lands along a local axis, then assemble a point from a value along the
 * height-carrying axis and one across it — and getting either of them subtly
 * wrong puts the hardware on the wrong side of a door.
 */
/** Local coordinate of an assembly-space plane, along the axis that carries it. */
export function localOf(frame: LocalFrame, value: number, axis: 'x' | 'y' | 'z'): number {
  const map = mapAxis(frame, axis);
  if (!map) return 0;
  return (value - frame.origin[axis]) * map.sign;
}

/** A local point from a value along the height-carrying axis and one across it. */
export function axisPoint(
  heightMap: AxisMap,
  across: number,
  along: number,
): { x: number; y: number } {
  return heightMap.which === 'v' ? { x: across, y: along } : { x: along, y: across };
}

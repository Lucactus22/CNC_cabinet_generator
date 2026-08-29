import { frameOf } from '../model/frame.js';
import type { Part } from '../model/types.js';
import { mapAxis } from '../joinery/helpers.js';
import type { HandleRequest } from '../build/builder.js';
import { axisPoint, localOf } from './boring.js';
import type { HandleEntry, HandlePlacement } from './catalogue.js';

export interface HandleResult {
  warnings: string[];
}

/**
 * Clearance holes for a pull.
 *
 * The fixing screws pass right through the door into the back of the handle, so
 * these are through holes: they can be cut from whichever face the door is
 * already on the bed for, and they do not add a flip to a door that would not
 * otherwise need one.
 *
 * Where the handle goes is the one hardware decision that is taste rather than
 * specification, so it comes from the placement settings rather than from the
 * catalogue entry. Whether it fits on the door is decided in `fit.ts`.
 */
export function applyHandles(
  entry: HandleEntry,
  placement: HandlePlacement,
  parts: Part[],
  requests: HandleRequest[],
): HandleResult {
  const warnings: string[] = [];
  if (requests.length === 0) return { warnings };

  const byId = new Map(parts.map((p) => [p.id, p]));

  for (const req of requests) {
    const door = byId.get(req.doorId);
    if (!door) continue;

    const frame = frameOf(door);
    const zMap = mapAxis(frame, 'z');
    const xMap = mapAxis(frame, 'x');
    if (!zMap || !xMap) {
      warnings.push(`${door.label}: could not work out which way round the door sits.`);
      continue;
    }

    for (const screw of screwPositions(door, req.hingeSide, entry, placement)) {
      const pt = axisPoint(zMap, localOf(frame, screw.x, 'x'), localOf(frame, screw.z, 'z'));
      door.features.push({
        kind: 'drill',
        x: pt.x,
        y: pt.y,
        diameter: entry.boring.screwDiameter,
        depth: 'thru',
        side: 'A',
        purpose: 'handle',
      });
    }
  }

  return { warnings };
}

/**
 * Where the fixing screws land, in assembly space.
 *
 * A vertical handle is referenced to the door's *opening* edge — the one away
 * from the hinges — because that is the edge a hand reaches for; a horizontal
 * one is centred across the door, which is how they are hung.
 */
export function screwPositions(
  door: Part,
  hingeSide: 'low' | 'high',
  entry: HandleEntry,
  placement: HandlePlacement,
): Array<{ x: number; z: number }> {
  const { centres, style } = entry.boring;
  const pair = style === 'bar' ? centres : 0;

  const midX = (door.box.min.x + door.box.max.x) / 2;
  const midZ = (door.box.min.z + door.box.max.z) / 2;

  if (placement.orientation === 'horizontal') {
    const z =
      placement.from === 'centre'
        ? midZ
        : placement.from === 'top'
          ? door.box.max.z - placement.endOffset
          : door.box.min.z + placement.endOffset;
    return pair === 0
      ? [{ x: midX, z }]
      : [
          { x: midX - pair / 2, z },
          { x: midX + pair / 2, z },
        ];
  }

  // Whichever edge the hinges are on, the handle goes on the other one.
  const openingX = hingeSide === 'low' ? door.box.max.x : door.box.min.x;
  const inward = hingeSide === 'low' ? -1 : 1;
  const x = openingX + inward * placement.edgeOffset;

  if (placement.from === 'centre') {
    return pair === 0
      ? [{ x, z: midZ }]
      : [
          { x, z: midZ - pair / 2 },
          { x, z: midZ + pair / 2 },
        ];
  }
  // Measured from the end the handle sits at, so the same offset reads the same
  // way up on a base door and down on a wall door.
  const near =
    placement.from === 'top'
      ? door.box.max.z - placement.endOffset
      : door.box.min.z + placement.endOffset;
  const far = placement.from === 'top' ? near - pair : near + pair;
  return pair === 0
    ? [{ x, z: near }]
    : [
        { x, z: near },
        { x, z: far },
      ];
}

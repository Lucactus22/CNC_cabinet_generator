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
    const door = byId.get(req.frontId);
    if (!door) continue;

    const frame = frameOf(door);
    const zMap = mapAxis(frame, 'z');
    const xMap = mapAxis(frame, 'x');
    if (!zMap || !xMap) {
      warnings.push(`${door.label}: could not work out which way round the door sits.`);
      continue;
    }

    const screws =
      req.front === 'door'
        ? screwPositions(door, req.hingeSide, entry, placement)
        : drawerScrewPositions(door, entry);
    boreThrough(door, screws, entry.boring.screwDiameter, 'handle');

    // A drawer pull is bolted from inside the box, through the sub-front and
    // the face together, so the sub-front needs the same holes where they
    // meet it. A box too narrow or too short to build has no sub-front.
    if (req.front === 'drawer') {
      const sub = byId.get(req.subFrontId);
      if (!sub) continue;
      const misses = screws.some(
        (s) =>
          s.x < sub.box.min.x + 1e-6 ||
          s.x > sub.box.max.x - 1e-6 ||
          s.z < sub.box.min.z + 1e-6 ||
          s.z > sub.box.max.z - 1e-6,
      );
      if (misses) {
        warnings.push(
          `${door.label}: the pull's bolts land outside the sub-front behind the face, so they were not bored through it. Fix the pull to the face with its own screws before the face is screwed on.`,
        );
        continue;
      }
      // Its own purpose, so the checks that judge a pull by the front it is
      // fitted to — a door's thickness against the screws, a hole off the
      // edge — read the face and not the box behind it.
      boreThrough(sub, screws, entry.boring.screwDiameter, 'handle-sub-front');
    }
  }

  return { warnings };
}

/** Clearance holes through a front-facing panel at assembly-space (x, z) positions. */
function boreThrough(
  panel: Part,
  at: Array<{ x: number; z: number }>,
  diameter: number,
  purpose: string,
): void {
  const frame = frameOf(panel);
  const zMap = mapAxis(frame, 'z');
  if (!zMap) return;
  for (const screw of at) {
    const pt = axisPoint(zMap, localOf(frame, screw.x, 'x'), localOf(frame, screw.z, 'z'));
    panel.features.push({
      kind: 'drill',
      x: pt.x,
      y: pt.y,
      diameter,
      depth: 'thru',
      side: 'A',
      purpose,
    });
  }
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

/**
 * Where a drawer pull's fixing screws land: across the face, centred both
 * ways.
 *
 * The door placement settings are measured from a door's opening edge, which
 * a drawer face does not have, and a pull run up a drawer front or pushed to
 * one end of it is not how one is hung. Centred across is the convention, so
 * it is not a setting.
 */
export function drawerScrewPositions(
  face: Part,
  entry: HandleEntry,
): Array<{ x: number; z: number }> {
  const { centres, style } = entry.boring;
  const pair = style === 'bar' ? centres : 0;
  const midX = (face.box.min.x + face.box.max.x) / 2;
  const midZ = (face.box.min.z + face.box.max.z) / 2;
  return pair === 0
    ? [{ x: midX, z: midZ }]
    : [
        { x: midX - pair / 2, z: midZ },
        { x: midX + pair / 2, z: midZ },
      ];
}

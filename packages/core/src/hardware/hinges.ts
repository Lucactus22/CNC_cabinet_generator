import { circlePath } from '../geom/index.js';
import { frameOf } from '../model/frame.js';
import type { DrillFeature, Part, PocketFeature } from '../model/types.js';
import { mapAxis } from '../joinery/helpers.js';
import type { HingeRequest } from '../build/builder.js';
import { axisPoint, localOf } from './boring.js';
import type { HingeEntry, HingeSpec } from './catalogue.js';

export interface HingeResult {
  warnings: string[];
}

/**
 * Boring for 35 mm cup concealed hinges.
 *
 * The door gets the cup and its two press-fit dowels on its back face; the
 * carcass panel gets the mounting plate holes on the 32 mm system. Every
 * dimension comes from the catalogue entry the project selected, so a different
 * make is a different entry rather than a different code path. Whether that
 * hinge suits the doors it has been pointed at is decided in `fit.ts` — this
 * function only knows how to bore.
 */
export function applyHinges(
  entry: HingeEntry,
  parts: Part[],
  requests: HingeRequest[],
): HingeResult {
  const warnings: string[] = [];
  if (requests.length === 0) return { warnings };

  const h = entry.boring;
  const byId = new Map(parts.map((p) => [p.id, p]));

  for (const req of requests) {
    const door = byId.get(req.doorId);
    const panel = byId.get(req.carcassPanelId);
    if (!door) continue;
    boreDoor(door, req, h, warnings);
    if (panel) {
      if (req.mount === 'frame') boreFaceFrameStile(panel, req, h);
      else borePanel(panel, req, h);
    }
  }

  return { warnings };
}

/** Cup and dowels, on the door's back face. */
function boreDoor(door: Part, req: HingeRequest, h: HingeSpec, warnings: string[]): void {
  const frame = frameOf(door);
  const zMap = mapAxis(frame, 'z');
  const xMap = mapAxis(frame, 'x');
  if (!zMap || !xMap) {
    warnings.push(`${door.label}: could not work out which way round the door sits.`);
    return;
  }

  // Local coordinates of the hinged edge, and which way is into the door.
  const hingeAtLowX = req.side === 'low';
  const edgeLocal = localOf(frame, hingeAtLowX ? door.box.min.x : door.box.max.x, 'x');
  const inward = hingeAtLowX ? xMap.sign : -xMap.sign;
  const cupCentre = h.boringDistance + h.cupDiameter / 2;

  for (const z of req.heights) {
    const along = localOf(frame, z, 'z');
    const across = edgeLocal + inward * cupCentre;

    const centre = axisPoint(zMap, across, along);
    const cup: PocketFeature = {
      // Pocketed rather than drilled: a 35 mm bore is one plunge with a
      // Forstner, but every 3-axis router can clear it with the cutter it
      // already has in the spindle.
      kind: 'pocket',
      path: circlePath(centre.x, centre.y, h.cupDiameter / 2),
      depth: h.cupDepth,
      side: 'A',
      purpose: 'hinge-cup',
    };
    door.features.push(cup);

    // Two press-fit dowels, set behind the cup's centre line.
    const dowelAcross = across + inward * h.dowelOffset;
    for (const d of [-h.dowelSpacing / 2, h.dowelSpacing / 2]) {
      const pt = axisPoint(zMap, dowelAcross, along + d);
      const hole: DrillFeature = {
        kind: 'drill',
        x: pt.x,
        y: pt.y,
        diameter: h.dowelDiameter,
        depth: h.dowelDepth,
        side: 'A',
        purpose: 'hinge-dowel',
      };
      door.features.push(hole);
    }
  }
}

/** Mounting plate holes in the carcass panel, on the 32 mm system. */
function borePanel(panel: Part, req: HingeRequest, h: HingeSpec): void {
  const frame = frameOf(panel);
  const zMap = mapAxis(frame, 'z');
  const yMap = mapAxis(frame, 'y');
  if (!zMap || !yMap) return;

  // The plates go on whichever face looks at the door.
  const side: 'A' | 'B' = faceTowardDoor(panel, req);
  const frontLocal = localOf(frame, req.yFront, 'y');
  const across = frontLocal + yMap.sign * h.plateFrontOffset;

  for (const z of req.heights) {
    const along = localOf(frame, z, 'z');
    for (const d of [-h.plateHoleSpacing / 2, h.plateHoleSpacing / 2]) {
      const pt = axisPoint(zMap, across, along + d);
      panel.features.push({
        kind: 'drill',
        x: pt.x,
        y: pt.y,
        diameter: h.plateHoleDiameter,
        depth: h.plateHoleDepth,
        side,
        purpose: 'hinge-plate',
      });
    }
  }
}

/**
 * Mounting plate holes in a face-frame stile, on the 32 mm system.
 *
 * A stile shares a door's own orientation — both are flat boards facing the
 * room, not a carcass side facing sideways into it — so this follows
 * `boreDoor`'s edge-and-inward math rather than `borePanel`'s. `plateFrontOffset`
 * is reused for a different measurement than it names on a carcass panel: not
 * how far behind the front edge the plate sits, but how far in from the
 * stile's own door-side edge, because a stile has no meaningful depth of its
 * own to measure into — its whole thickness is already spoken for by the half
 * lap at each end. It is the same 32 mm system either way, just referenced
 * from a different edge.
 */
function boreFaceFrameStile(stile: Part, req: HingeRequest, h: HingeSpec): void {
  const frame = frameOf(stile);
  const zMap = mapAxis(frame, 'z');
  const xMap = mapAxis(frame, 'x');
  if (!zMap || !xMap) return;

  // The door sits on the opposite side of the stile from the edge it shares
  // with it: a door hinged on its own low-x edge is bounded by the stile to
  // its left, which meets it at that stile's high-x edge.
  const hingeAtLow = req.side === 'low';
  const edgeLocal = localOf(frame, hingeAtLow ? stile.box.max.x : stile.box.min.x, 'x');
  const awayFromDoor = hingeAtLow ? -xMap.sign : xMap.sign;
  const across = edgeLocal + awayFromDoor * h.plateFrontOffset;

  // The plates go on whichever face looks into the cabinet, the same face a
  // door's own hinge cup is bored into — which for a stile, built the same
  // way round as a door, is always face A.
  for (const z of req.heights) {
    const along = localOf(frame, z, 'z');
    for (const d of [-h.plateHoleSpacing / 2, h.plateHoleSpacing / 2]) {
      const pt = axisPoint(zMap, across, along + d);
      stile.features.push({
        kind: 'drill',
        x: pt.x,
        y: pt.y,
        diameter: h.plateHoleDiameter,
        depth: h.plateHoleDepth,
        side: 'A',
        purpose: 'hinge-plate',
      });
    }
  }
}

/** Which machined face of the carcass panel the door swings against. */
function faceTowardDoor(panel: Part, req: HingeRequest): 'A' | 'B' {
  // The bay, and so the door, lies on the opposite side of the panel from the
  // hinge: a door hinged on its low-x edge hangs to the high-x side of its
  // panel, and vice versa.
  const doorIsHigh = req.side === 'low';
  const faceAIsHigh = panel.faceASign === '+';
  return doorIsHigh === faceAIsHigh ? 'A' : 'B';
}

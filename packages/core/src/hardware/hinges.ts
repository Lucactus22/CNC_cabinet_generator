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
    if (panel) borePanel(panel, req, h);
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

/** Which machined face of the carcass panel the door swings against. */
function faceTowardDoor(panel: Part, req: HingeRequest): 'A' | 'B' {
  // The bay, and so the door, lies on the opposite side of the panel from the
  // hinge: a door hinged on its low-x edge hangs to the high-x side of its
  // panel, and vice versa.
  const doorIsHigh = req.side === 'low';
  const faceAIsHigh = panel.faceASign === '+';
  return doorIsHigh === faceAIsHigh ? 'A' : 'B';
}

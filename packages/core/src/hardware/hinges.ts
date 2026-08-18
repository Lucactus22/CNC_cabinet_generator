import { circlePath } from '../geom/index.js';
import { frameOf } from '../model/frame.js';
import type {
  CabinetParams,
  DrillFeature,
  HingeSpec,
  Part,
  PocketFeature,
} from '../model/types.js';
import { mapAxis } from '../joinery/helpers.js';
import type { HingeRequest } from '../build/builder.js';

export interface HingeResult {
  warnings: string[];
}

/**
 * Boring for 35 mm cup concealed hinges, to the IKEA UTRUSTA pattern.
 *
 * The door gets the cup and its two press-fit dowels on its back face; the
 * carcass panel gets the mounting plate holes on the 32 mm system. Every
 * dimension comes from the hinge spec so a different make can be dialled in.
 */
export function applyHinges(
  params: CabinetParams,
  parts: Part[],
  requests: HingeRequest[],
): HingeResult {
  const warnings: string[] = [];
  if (requests.length === 0) return { warnings };

  const h = params.hinge;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const cupCentre = h.boringDistance + h.cupDiameter / 2;
  let reported = false;

  for (const req of requests) {
    const door = byId.get(req.doorId);
    const panel = byId.get(req.carcassPanelId);
    if (!door) continue;

    if (!reported) {
      reported = true;
      if (h.cupDepth >= door.thickness - 1e-9) {
        warnings.push(
          `${door.label}: a ${h.cupDepth} mm hinge cup goes straight through ${door.thickness.toFixed(1)} mm material. Use a thicker door.`,
        );
      } else if (door.thickness - h.cupDepth < 3) {
        warnings.push(
          `${door.label}: a ${h.cupDepth} mm cup leaves only ${(door.thickness - h.cupDepth).toFixed(1)} mm behind it in ${door.thickness.toFixed(1)} mm material.`,
        );
      }
      if (h.boringDistance < 3 || h.boringDistance > 8) {
        warnings.push(
          `Hinge boring distance of ${h.boringDistance} mm is outside the 3-8 mm the hardware is made for.`,
        );
      }
    }

    boreDoor(door, req, h, warnings);
    if (panel) borePanel(panel, req, h, warnings);
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
  const edgeLocal = localOf(door, frame, hingeAtLowX ? door.box.min.x : door.box.max.x, 'x');
  const inward = hingeAtLowX ? xMap.sign : -xMap.sign;
  const cupCentre = h.boringDistance + h.cupDiameter / 2;

  for (const z of req.heights) {
    const along = localOf(door, frame, z, 'z');
    const across = edgeLocal + inward * cupCentre;

    const cup: PocketFeature = {
      // Pocketed rather than drilled: a 35 mm bore is one plunge with a
      // Forstner, but every 3-axis router can clear it with the cutter it
      // already has in the spindle.
      kind: 'pocket',
      path: circlePath(axisPoint(zMap, across, along).x, axisPoint(zMap, across, along).y, h.cupDiameter / 2),
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
function borePanel(panel: Part, req: HingeRequest, h: HingeSpec, warnings: string[]): void {
  const frame = frameOf(panel);
  const zMap = mapAxis(frame, 'z');
  const yMap = mapAxis(frame, 'y');
  if (!zMap || !yMap) return;

  if (h.plateHoleDepth >= panel.thickness) {
    warnings.push(
      `${panel.label}: ${h.plateHoleDepth} mm plate holes would break through ${panel.thickness.toFixed(1)} mm material.`,
    );
  }

  // The plates go on whichever face looks at the door.
  const side: 'A' | 'B' = faceTowardDoor(panel, req);
  const frontLocal = localOf(panel, frame, req.yFront, 'y');
  const across = frontLocal + yMap.sign * h.plateFrontOffset;

  for (const z of req.heights) {
    const along = localOf(panel, frame, z, 'z');
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
  const centre = (panel.box.min.x + panel.box.max.x) / 2;
  const doorIsHigh = req.side === 'low';
  const faceAIsHigh = panel.faceASign === '+';
  void centre;
  return doorIsHigh === faceAIsHigh ? 'A' : 'B';
}

/** Local coordinate of an assembly-space plane, along the axis that carries it. */
function localOf(
  part: Part,
  frame: ReturnType<typeof frameOf>,
  value: number,
  axis: 'x' | 'y' | 'z',
): number {
  const map = mapAxis(frame, axis);
  if (!map) return 0;
  const origin = frame.origin[axis];
  return (value - origin) * map.sign;
}

/** Assemble a local point from a value along the z-carrying axis and one across it. */
function axisPoint(
  zMap: { which: 'u' | 'v'; sign: 1 | -1 },
  across: number,
  along: number,
): { x: number; y: number } {
  return zMap.which === 'v' ? { x: across, y: along } : { x: along, y: across };
}

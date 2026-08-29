import { frameOf } from '../model/frame.js';
import type { DrillFeature, Part } from '../model/types.js';
import { mapAxis } from '../joinery/helpers.js';
import type { SlideRequest } from '../build/builder.js';
import { axisPoint, localOf } from './boring.js';
import type { SlideEntry } from './catalogue.js';

export interface SlideResult {
  warnings: string[];
}

/**
 * Mounting holes for an undermount runner: two per box side — front and rear
 * anchor points along the runner — and the same two on each cabinet panel
 * the bay is bounded by, at the height the runner actually sits.
 *
 * Blum's own screw-location table gives a different pair of offsets for
 * every runner length rather than one constant that would reduce to code
 * cleanly; this bores a generic, symmetric pair held in from each end of the
 * runner instead of transcribing that table. See docs/DRAWERS.md.
 */
export function applySlides(
  entry: SlideEntry,
  parts: Part[],
  requests: SlideRequest[],
): SlideResult {
  const warnings: string[] = [];
  if (requests.length === 0) return { warnings };

  const byId = new Map(parts.map((p) => [p.id, p]));
  const diameter = entry.boring.screwDiameter;

  for (const req of requests) {
    const front = req.boxFrontY + req.mountInset;
    const rear = req.boxFrontY + req.length - req.mountInset;
    const ys = rear > front ? [front, rear] : [(front + rear) / 2];

    // Both box sides bore on their outward face — face B on this codebase's
    // own convention for a carcass's left and right sides alike, since face A
    // is always the one looking into what the panel encloses (here, the
    // drawer's own interior).
    const boxLeft = byId.get(req.boxLeftId);
    if (boxLeft) boreHoles(boxLeft, ys, req.z, diameter, 'B', 'slide-side', warnings);
    const boxRight = byId.get(req.boxRightId);
    if (boxRight) boreHoles(boxRight, ys, req.z, diameter, 'B', 'slide-side', warnings);

    // A cabinet panel bores on whichever face looks toward this bay: the
    // left-bounding panel's high-X face, the right-bounding panel's low-X one.
    const panelLeft = byId.get(req.panelLeftId);
    if (panelLeft)
      boreHoles(
        panelLeft,
        ys,
        req.z,
        diameter,
        faceTowardBay(panelLeft, true),
        'slide-panel',
        warnings,
      );
    const panelRight = byId.get(req.panelRightId);
    if (panelRight) {
      boreHoles(
        panelRight,
        ys,
        req.z,
        diameter,
        faceTowardBay(panelRight, false),
        'slide-panel',
        warnings,
      );
    }
  }

  return { warnings };
}

function boreHoles(
  panel: Part,
  ys: number[],
  z: number,
  diameter: number,
  side: 'A' | 'B',
  purpose: string,
  warnings: string[],
): void {
  const frame = frameOf(panel);
  const zMap = mapAxis(frame, 'z');
  const yMap = mapAxis(frame, 'y');
  if (!zMap || !yMap) {
    warnings.push(
      `${panel.label}: could not work out which way round this panel sits for slide boring.`,
    );
    return;
  }
  const along = localOf(frame, z, 'z');
  for (const y of ys) {
    const across = localOf(frame, y, 'y');
    const pt = axisPoint(zMap, across, along);
    const hole: DrillFeature = {
      kind: 'drill',
      x: pt.x,
      y: pt.y,
      diameter,
      depth: 'thru',
      side,
      purpose,
    };
    panel.features.push(hole);
  }
}

/** Which machined face of a bay-bounding panel looks toward the bay it bounds. */
function faceTowardBay(panel: Part, bayIsHigh: boolean): 'A' | 'B' {
  const faceAIsHigh = panel.faceASign === '+';
  return bayIsHigh === faceAIsHigh ? 'A' : 'B';
}

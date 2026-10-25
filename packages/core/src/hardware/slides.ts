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
 * Mounting holes for an undermount runner, in the two cabinet panels the bay
 * is bounded by, where the maker's own table puts the screws for the runner
 * length chosen.
 *
 * Nothing is bored in the drawer box. The runner does not screw to the box's
 * sides: the box drops onto it and is held by the locking devices under its
 * bottom and the rear hooks in its back, both set out with the maker's own
 * drilling template rather than a router — see docs/DRAWERS.md.
 */
export function applySlides(
  entry: SlideEntry,
  parts: Part[],
  requests: SlideRequest[],
): SlideResult {
  const warnings: string[] = [];
  if (requests.length === 0) return { warnings };

  const byId = new Map(parts.map((p) => [p.id, p]));
  const { screwHoleDiameter: diameter, screwHoleDepth: depth } = entry.boring;

  const framed = new Set<string>();
  for (const req of requests) {
    const panels = [byId.get(req.panelLeftId), byId.get(req.panelRightId)];
    if (req.faceFrame) {
      // Measured from the frame's front, the frameless table puts the front
      // screw 18-odd mm behind the carcass edge, nowhere a face-frame runner
      // is fixed. Said once per bay rather than bored wrong.
      const names = panels.filter((p): p is Part => p !== undefined).map((p) => p.label);
      const key = names.join('|');
      if (!framed.has(key)) {
        framed.add(key);
        warnings.push(
          `${names.join(' and ') || 'The cabinet sides'}: ${entry.name}'s screw table is for frameless cabinets, and behind a face frame the runner is fixed at the frame and on a rear bracket instead, so these were not bored for it. Fit the runners with the maker's face-frame brackets and wood screws.`,
        );
      }
      continue;
    }
    const row = entry.boring.screwPositions.find((r) => Math.abs(r.length - req.length) < 0.5);
    if (!row) {
      const names = panels.filter((p): p is Part => p !== undefined).map((p) => p.label);
      warnings.push(
        `${entry.name} gives no screw positions for its ${req.length} mm runner, so ${names.join(' and ') || 'the cabinet sides'} ${names.length === 1 ? 'was' : 'were'} not bored for it. Screw the runner on with wood screws, which need no hole, or add the positions to the entry.`,
      );
      continue;
    }
    const ys = row.at.map((a) => req.boxFrontY + a);

    // A cabinet panel bores on whichever face looks toward this bay: the
    // left-bounding panel's high-X face, the right-bounding panel's low-X one.
    const [panelLeft, panelRight] = panels;
    for (const [panel, bayIsHigh] of [
      [panelLeft, true],
      [panelRight, false],
    ] as const) {
      if (!panel) continue;
      // A hole deeper than the panel is a hole through its other face —
      // the outside of an end panel, or the next bay — which is the whole
      // reason these are blind.
      if (depth >= panel.thickness - 1e-6) {
        warnings.push(
          `${panel.label}: the ${entry.name} screw holes are ${depth} mm deep and the panel is only ${panel.thickness.toFixed(1)} mm thick, so they were not bored. Use wood screws, or a shallower hole on a copy of the entry.`,
        );
        continue;
      }
      boreHoles(panel, ys, req.z, diameter, depth, faceTowardBay(panel, bayIsHigh), warnings);
    }
  }

  // A divider with drawers on both sides takes the same table from both
  // faces, at the same heights when the drawers match. Two blind holes from
  // opposite faces that overlap and reach past the middle are one hole, and
  // two system screws driven into it from either side meet in the panel.
  const touched = new Set(requests.flatMap((r) => [r.panelLeftId, r.panelRightId]));
  for (const id of touched) {
    const panel = byId.get(id);
    if (!panel) continue;
    const holes = panel.features.filter(
      (f): f is DrillFeature => f.kind === 'drill' && f.purpose === 'slide-panel',
    );
    const meet = holes.some(
      (a) =>
        a.side === 'A' &&
        holes.some(
          (b) =>
            b.side === 'B' &&
            Math.hypot(a.x - b.x, a.y - b.y) < (a.diameter + b.diameter) / 2 &&
            (a.depth as number) + (b.depth as number) > panel.thickness,
        ),
    );
    if (meet) {
      warnings.push(
        `${panel.label} carries runners on both faces with their screw holes in the same places, and the ${depth} mm holes from each side meet inside the ${panel.thickness.toFixed(1)} mm panel: two system screws there will hit each other. Fix one side's runners with wood screws, clear of the other side's holes, or give the two bays different drawer heights.`,
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
  depth: number,
  side: 'A' | 'B',
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
      depth,
      side,
      purpose: 'slide-panel',
    };
    panel.features.push(hole);
  }
}

/** Which machined face of a bay-bounding panel looks toward the bay it bounds. */
function faceTowardBay(panel: Part, bayIsHigh: boolean): 'A' | 'B' {
  const faceAIsHigh = panel.faceASign === '+';
  return bayIsHigh === faceAIsHigh ? 'A' : 'B';
}

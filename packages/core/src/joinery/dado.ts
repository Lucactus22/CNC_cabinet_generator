import { rect, relieveCorners } from '../geom/index.js';
import type { CabinetParams, DrillFeature, Part, PocketFeature } from '../model/types.js';
import type { JointRequest } from '../build/builder.js';
import {
  contactOf,
  contactRect,
  cornerBetween,
  dirToFemale,
  edgeFacing,
  extendMaleInto,
  FRONT_DIR,
  isVerticalEdge,
  mapAxis,
  type LocalRect,
  type PartDraft,
} from './helpers.js';

export interface JointOutcome {
  warnings: string[];
}

/**
 * Housing joint: the male panel lands in a groove machined into the female.
 *
 * By default the groove stops short of the front edge so nothing shows on the
 * finished face. That leaves material in front of the groove, so the male panel
 * gets its front corner notched away — far enough to clear both the stop and
 * the radius the cutter leaves at the end of the pocket.
 */
export function applyDado(
  male: PartDraft,
  female: PartDraft,
  req: JointRequest,
  params: CabinetParams,
): JointOutcome {
  const warnings: string[] = [];
  const j = params.joinery;
  const toolR = params.tool.diameter / 2;
  const depth = clampDadoDepth(
    req.depthOverride ?? j.dadoDepth,
    female.part.thickness,
    female.part.label,
    warnings,
  );

  const c = contactOf(female.part, male.part);
  extendMaleInto(male.part, c, depth);

  const r = contactRect(female.part, male.part, c, depth, female.frame);
  if (!r) return { warnings };

  // The groove's width runs across the male panel's thickness.
  const widthAxis = mapAxis(female.frame, male.part.normalAxis);
  const groove: LocalRect = { ...r };
  if (widthAxis?.which === 'u') {
    groove.x -= j.fitClearance / 2;
    groove.w += j.fitClearance;
  } else {
    groove.y -= j.fitClearance / 2;
    groove.h += j.fitClearance;
  }

  const stop = req.stopFrontAtY !== undefined ? j.dadoStopFront : 0;
  if (stop > 0) {
    shortenAtFront(groove, female, req.stopFrontAtY!, stop);
    notchMaleFront(male, c, depth, stop + toolR + j.fitClearance, warnings);
  }

  if (groove.w < params.tool.diameter - 1e-6 || groove.h < params.tool.diameter - 1e-6) {
    warnings.push(
      `${female.part.label}: a ${fmt(Math.min(groove.w, groove.h))} mm groove is narrower than the ${params.tool.diameter} mm cutter.`,
    );
  }

  const pocket: PocketFeature = {
    kind: 'pocket',
    path: rect(groove.x, groove.y, groove.w, groove.h),
    depth,
    side: c.side,
    purpose: req.purpose,
  };
  female.part.features.push(pocket);

  if (j.screwHoles && req.purpose !== 'back') {
    addScrewHoles(female, groove, widthAxis?.which === 'u', j.screwSpacing, j.screwClearanceDiameter, c.side);
  }

  return { warnings };
}

/** Pull the groove back from the carcass front edge by `stop`. */
function shortenAtFront(
  groove: LocalRect,
  female: PartDraft,
  frontY: number,
  stop: number,
): void {
  const yMap = mapAxis(female.frame, 'y');
  if (!yMap) return;
  // Local coordinate of the carcass front face on this panel.
  const originY = female.frame.origin.y;
  const frontLocal = (frontY - originY) * yMap.sign;

  if (yMap.which === 'u') {
    if (Math.abs(groove.x - frontLocal) < Math.abs(groove.x + groove.w - frontLocal)) {
      groove.x += stop;
      groove.w -= stop;
    } else {
      groove.w -= stop;
    }
  } else {
    if (Math.abs(groove.y - frontLocal) < Math.abs(groove.y + groove.h - frontLocal)) {
      groove.y += stop;
      groove.h -= stop;
    } else {
      groove.h -= stop;
    }
  }
}

/**
 * Bite the male panel's front corner back so it clears the stopped groove.
 *
 * The notch has to run past the end of the pocket by at least the cutter
 * radius, because the pocket's end corners keep that much material.
 */
function notchMaleFront(
  male: PartDraft,
  c: ReturnType<typeof contactOf>,
  depth: number,
  notchLength: number,
  warnings: string[],
): void {
  const femaleEdge = edgeFacing(male.frame, dirToFemale(c));
  const frontEdge = edgeFacing(male.frame, FRONT_DIR);
  if (!femaleEdge || !frontEdge || isVerticalEdge(femaleEdge) === isVerticalEdge(frontEdge)) {
    // The panel does not present a front edge here, so there is nothing to hide.
    return;
  }
  const corner = cornerBetween(femaleEdge, frontEdge);
  if (!corner) return;

  const dx = isVerticalEdge(femaleEdge) ? depth : notchLength;
  const dy = isVerticalEdge(femaleEdge) ? notchLength : depth;

  const existing = male.notches.find((n) => n.corner === corner);
  if (existing) {
    existing.dx = Math.max(existing.dx, dx);
    existing.dy = Math.max(existing.dy, dy);
  } else {
    male.notches.push({ corner, dx, dy });
  }

  if (notchLength > male.base.w / 2 || depth > male.base.h / 2) {
    warnings.push(`${male.part.label}: the stopped-dado notch is large relative to the panel.`);
  }
}

/** Clearance holes through the female panel, into the edge of the male. */
function addScrewHoles(
  female: PartDraft,
  groove: LocalRect,
  widthAlongU: boolean,
  spacing: number,
  diameter: number,
  side: 'A' | 'B',
): void {
  const runLength = widthAlongU ? groove.h : groove.w;
  const count = Math.max(2, Math.round(runLength / spacing) + 1);
  const centre = widthAlongU ? groove.x + groove.w / 2 : groove.y + groove.h / 2;
  const start = widthAlongU ? groove.y : groove.x;
  // Hold the end fixings in from the edge so they do not split out.
  const inset = Math.min(40, runLength / 4);
  const usable = runLength - 2 * inset;
  if (usable <= 0) return;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const along = start + inset + usable * t;
    const hole: DrillFeature = {
      kind: 'drill',
      x: widthAlongU ? centre : along,
      y: widthAlongU ? along : centre,
      diameter,
      depth: 'thru',
      side,
      purpose: 'screw',
    };
    female.part.features.push(hole);
  }
}

/** Keep a groove from eating so much of a panel that it becomes a hinge. */
export function clampDadoDepth(
  requested: number,
  thickness: number,
  label: string,
  warnings: string[],
): number {
  const limit = thickness * 0.6;
  if (requested > limit + 1e-9) {
    warnings.push(
      `${label}: a ${requested} mm groove is too deep for ${thickness.toFixed(1)} mm material, so it was cut back to ${limit.toFixed(1)} mm.`,
    );
    return limit;
  }
  return requested;
}

const fmt = (n: number): string => n.toFixed(1);
export { relieveCorners, type Part };

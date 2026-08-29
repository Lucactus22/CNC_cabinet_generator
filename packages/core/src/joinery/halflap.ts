import { rect } from '../geom/index.js';
import type { PocketFeature, ProjectParams } from '../model/types.js';
import { intersectBoxes, localRectOf } from '../model/frame.js';
import type { PartDraft } from './helpers.js';

export interface HalfLapOutcome {
  warnings: string[];
}

/**
 * Half lap between two coplanar solid-stock members — a face-frame stile and
 * a rail — that cross in the frame's own plane, rather than meeting edge to
 * face the way a carcass panel meets a groove.
 *
 * Each member loses half its own thickness over the footprint where they
 * cross, cut from opposite faces: the stile from its face A (the back), the
 * rail from its face B (the front). Combined the two halves fill the frame's
 * full thickness with nothing left proud or short on either face, and every
 * cut is a flat-bottomed pocket the spindle already carries — no tooling a
 * dado or a tab-and-slot joint would not also need.
 *
 * Cutting the stile from its back is what keeps its own front face — and, by
 * the same face, wherever a hinge's mounting plate bores into it — on one
 * side of the material with nothing to flip for.
 */
export function applyHalfLap(
  stile: PartDraft,
  rail: PartDraft,
  params: ProjectParams,
): HalfLapOutcome {
  const warnings: string[] = [];
  const half = stile.part.thickness / 2;

  const overlap = intersectBoxes(stile.part.box, rail.part.box);
  if (!overlap) return { warnings };

  const stileRect = localRectOf(stile.frame, overlap);
  const railRect = localRectOf(rail.frame, overlap);
  if (stileRect.w <= 1e-6 || stileRect.h <= 1e-6) return { warnings };

  const toolD = params.tool.diameter;
  const narrowest = Math.min(stileRect.w, stileRect.h, railRect.w, railRect.h);
  if (narrowest < toolD - 1e-6) {
    warnings.push(
      `${stile.part.label} and ${rail.part.label}: a ${narrowest.toFixed(1)} mm half lap is narrower than the ${toolD} mm cutter.`,
    );
  }

  const stilePocket: PocketFeature = {
    kind: 'pocket',
    path: rect(stileRect.x, stileRect.y, stileRect.w, stileRect.h),
    depth: half,
    side: 'A',
    purpose: 'face-frame-lap',
  };
  const railPocket: PocketFeature = {
    kind: 'pocket',
    path: rect(railRect.x, railRect.y, railRect.w, railRect.h),
    depth: half,
    side: 'B',
    purpose: 'face-frame-lap',
  };
  stile.part.features.push(stilePocket);
  rail.part.features.push(railPocket);

  return { warnings };
}

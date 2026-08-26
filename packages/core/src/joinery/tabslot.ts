import { rect, relieveCorners } from '../geom/index.js';
import type { AABB, Axis, ProjectParams, ThroughFeature } from '../model/types.js';
import { localRectOf } from '../model/frame.js';
import type { JointRequest } from '../build/builder.js';
import {
  contactOf,
  dirToFemale,
  edgeFacing,
  isVerticalEdge,
  mapAxis,
  type PartDraft,
} from './helpers.js';
import type { JointOutcome } from './dado.js';

const ALL_AXES: Axis[] = ['x', 'y', 'z'];

/**
 * Through mortise and tenon: tabs on the male panel pass right through slots in
 * the female one, so the joint jigs itself square with no fasteners.
 *
 * Every slot corner gets a relief, otherwise the cutter's radius leaves
 * material exactly where the tab's square corner needs to sit.
 */
export function applyTabSlot(
  male: PartDraft,
  female: PartDraft,
  _req: JointRequest,
  params: ProjectParams,
): JointOutcome {
  const warnings: string[] = [];
  const j = params.joinery;
  const toolR = params.tool.diameter / 2;

  const c = contactOf(female.part, male.part);
  // The tenons run along whichever axis both panels share.
  const runAxis = ALL_AXES.find((a) => a !== female.part.normalAxis && a !== male.part.normalAxis);
  if (!runAxis) return { warnings };

  const lo = Math.max(male.part.box.min[runAxis], female.part.box.min[runAxis]);
  const hi = Math.min(male.part.box.max[runAxis], female.part.box.max[runAxis]);
  const runLength = hi - lo;
  if (runLength <= 0) return { warnings };

  const spans = planTabs(runLength, j.tabWidth, j.tabMinCount);
  if (spans.length === 0) {
    warnings.push(`${male.part.label}: too short for a tab-and-slot joint, no tabs were placed.`);
    return { warnings };
  }

  const tabDepth = female.part.thickness;
  const maleEdge = edgeFacing(male.frame, dirToFemale(c));
  if (!maleEdge) return { warnings };

  for (const span of spans) {
    const a = lo + span.at;
    const b = a + span.width;

    // The tenon as a solid: the male's thickness, the tab's width, and the full
    // depth of the female so it passes clean through.
    const tenon: AABB = {
      min: { ...male.part.box.min },
      max: { ...male.part.box.max },
    };
    tenon.min[runAxis] = a;
    tenon.max[runAxis] = b;
    tenon.min[c.axis] = female.part.box.min[c.axis];
    tenon.max[c.axis] = female.part.box.max[c.axis];

    // --- Slot in the female -------------------------------------------
    const s = localRectOf(female.frame, tenon);
    const slot = rect(
      s.x - j.fitClearance / 2,
      s.y - j.fitClearance / 2,
      s.w + j.fitClearance,
      s.h + j.fitClearance,
    );
    if (s.w < params.tool.diameter || s.h < params.tool.diameter) {
      warnings.push(
        `${female.part.label}: a ${Math.min(s.w, s.h).toFixed(1)} mm slot is narrower than the ${params.tool.diameter} mm cutter.`,
      );
    }
    const relieved = relieveCorners(slot, {
      toolRadius: toolR,
      style: j.reliefStyle,
      corners: 'convex',
    });
    const feature: ThroughFeature = { kind: 'through', path: relieved, purpose: 'tab-slot' };
    female.part.features.push(feature);

    // --- Tab on the male ----------------------------------------------
    const m = localRectOf(male.frame, tenon);
    const along = isVerticalEdge(maleEdge) ? m.y : m.x;
    const width = isVerticalEdge(maleEdge) ? m.h : m.w;
    male.tabs.push({ edge: maleEdge, at: along, width, depth: tabDepth });
  }

  // Keep the mapping helper honest even when unused, so a frame that cannot
  // carry the joint is reported rather than silently producing nothing.
  if (!mapAxis(female.frame, male.part.normalAxis)) {
    warnings.push(`${female.part.label}: could not resolve the slot orientation.`);
  }

  return { warnings };
}

interface TabSpan {
  at: number;
  width: number;
}

/**
 * Spread tabs along an edge, held in from both ends so the joint does not break
 * out, and never wider than the space each one is allotted.
 */
export function planTabs(runLength: number, targetWidth: number, minCount: number): TabSpan[] {
  const inset = Math.min(30, runLength * 0.1);
  const usable = runLength - 2 * inset;
  if (usable < targetWidth) return [];

  const ideal = Math.round(usable / (targetWidth * 3));
  const count = Math.max(minCount, Math.max(1, ideal));
  const pitch = usable / count;
  const width = Math.min(targetWidth, pitch * 0.6);
  if (width <= 0) return [];

  const out: TabSpan[] = [];
  for (let i = 0; i < count; i++) {
    const centre = inset + pitch * (i + 0.5);
    out.push({ at: centre - width / 2, width });
  }
  return out;
}

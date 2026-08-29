import type { PanelEdge, ProjectParams, Vec3 } from '../model/types.js';
import {
  edgeFacing,
  FRONT_DIR,
  isVerticalEdge,
  LEFT_DIR,
  REAR_DIR,
  RIGHT_DIR,
  type PartDraft,
} from './helpers.js';

const TOP_DIR: Vec3 = { x: 0, y: 0, z: 1 };
const BOTTOM_DIR: Vec3 = { x: 0, y: 0, z: -1 };

const EDGE_DIRECTION: Record<PanelEdge, Vec3> = {
  front: FRONT_DIR,
  back: REAR_DIR,
  left: LEFT_DIR,
  right: RIGHT_DIR,
  top: TOP_DIR,
  bottom: BOTTOM_DIR,
};

/**
 * Shrink a blank on its banded edges by the tape's own thickness, so gluing
 * the tape back on after the sheet is cut returns the part to the size it was
 * designed at.
 *
 * Applied to `draft.base` — the same rectangle notches and tabs are placed
 * against — rather than as a separate offset, so a stopped-dado notch or a
 * toe-kick notch that shares a banded edge is still measured from where the
 * tape's own outer face will be, not from the smaller substrate the router
 * actually sees: once the tape is on, everything positioned relative to that
 * edge lands exactly where it was designed to. Hinge and shelf-pin boring
 * never go through `base` at all — they work from the part's frame, fixed
 * when it was built — so they are unaffected by banding either way, which is
 * correct: those distances are always measured from the finished edge.
 *
 * `part.exposed` is left alone for the same reason `taper` leaves it alone:
 * it marks the region a surface effect may use, and that region is the
 * finished, banded panel, not today's substrate.
 */
export function applyBanding(
  draft: PartDraft,
  params: ProjectParams,
  warnings: string[],
  warnedRoleEdges: Set<string>,
): void {
  const spec = params.edgeBanding[draft.part.role];
  if (!spec || spec.edges.length === 0) return;
  const material = params.bandingMaterials.find((m) => m.id === spec.materialId);
  if (!material) {
    const key = `${draft.part.role}:missing:${spec.materialId}`;
    if (!warnedRoleEdges.has(key)) {
      warnedRoleEdges.add(key);
      warnings.push(
        `${draft.part.label}: banding material '${spec.materialId}' is not in the list, so no banding was applied.`,
      );
    }
    return;
  }

  const resolved: Array<{ edge: PanelEdge; local: 'left' | 'right' | 'top' | 'bottom' }> = [];
  for (const edge of spec.edges) {
    const local = edgeFacing(draft.frame, EDGE_DIRECTION[edge]);
    if (local) {
      resolved.push({ edge, local });
    } else {
      const key = `${draft.part.role}:${edge}`;
      if (!warnedRoleEdges.has(key)) {
        warnedRoleEdges.add(key);
        warnings.push(
          `${draft.part.role} parts have no '${edge}' edge, so that banding rule never applies to them.`,
        );
      }
    }
  }
  if (resolved.length === 0) return;

  let insetLeft = 0;
  let insetRight = 0;
  let insetBottom = 0;
  let insetTop = 0;
  for (const { local } of resolved) {
    if (local === 'left') insetLeft = material.thickness;
    else if (local === 'right') insetRight = material.thickness;
    else if (local === 'bottom') insetBottom = material.thickness;
    else insetTop = material.thickness;
  }

  const { base } = draft;
  // Tape length is measured along the *finished* size, before this or any
  // other edge's own inset — not the substrate's shrunk size. A door banded
  // on all four edges has its top and bottom tape run the door's full
  // designed width regardless of the left and right edges also being banded,
  // because whichever pair goes on second (top/bottom or left/right — the
  // banding order is not modelled) is measured after the first pair has
  // already returned that dimension to its finished size. Reading the
  // already-shrunk `base` here would under-report by up to twice the tape
  // thickness on the pair that goes second, silently on every such panel.
  const finishedW = base.w;
  const finishedH = base.h;

  if (insetLeft + insetRight >= base.w - 1e-6) {
    warnings.push(
      `${draft.part.label}: ${material.name} banding on both edges would leave nothing of the ${base.w.toFixed(0)} mm panel, so those edges were left unbanded.`,
    );
    insetLeft = 0;
    insetRight = 0;
  }
  if (insetBottom + insetTop >= base.h - 1e-6) {
    warnings.push(
      `${draft.part.label}: ${material.name} banding on both edges would leave nothing of the ${base.h.toFixed(0)} mm panel, so those edges were left unbanded.`,
    );
    insetBottom = 0;
    insetTop = 0;
  }

  base.x += insetLeft;
  base.w -= insetLeft + insetRight;
  base.y += insetBottom;
  base.h -= insetBottom + insetTop;

  for (const { edge, local } of resolved) {
    const kept =
      (local === 'left' && insetLeft > 0) ||
      (local === 'right' && insetRight > 0) ||
      (local === 'bottom' && insetBottom > 0) ||
      (local === 'top' && insetTop > 0);
    if (!kept) continue;
    draft.part.bandedEdges.push({
      edge,
      localEdge: local,
      materialId: material.id,
      length: isVerticalEdge(local) ? finishedH : finishedW,
    });
  }
}

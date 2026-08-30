import { bboxOf } from '../geom/index.js';
import { blankSize } from '../nest/index.js';
import { forcesFace, partsNeedingFlip } from '../joinery/index.js';
import type { FaceSide, Part, PartRole, ProjectParams } from '../model/types.js';

/**
 * One part, as a printed label would say it: enough to pick the right blank
 * off a stack of them and set it down the right way up.
 */
export interface PartLabel {
  id: string;
  /** The part's own label — already a sentence a woodworker would say, e.g. "Base carcass side, left". */
  description: string;
  role: PartRole;
  cabinet: string;
  carcass: string;
  material: string;
  thickness: number;
  length: number;
  width: number;
  /**
   * Which face carries the machining that forces an orientation — the same
   * face the engraved ID goes on, when labels are engraved (see
   * `joinery/index.ts`'s `materialise`). 'either' when nothing on the part
   * cares which way up it sits, e.g. a plain, unmachined blank.
   */
  faceUp: FaceSide | 'either';
  /** True when the part is machined on both faces and has to be turned over mid-job. */
  flipped: boolean;
}

/**
 * A label sheet: one entry per part, in the same order the cut list uses.
 *
 * Deliberately reuses `part.label` for the description rather than composing
 * a new sentence from the role — that label is already written the way a
 * woodworker would say it, and R-10 would only be inventing a worse copy of
 * it.
 */
export function buildLabelSheet(params: ProjectParams, parts: Part[]): PartLabel[] {
  const flipped = new Set(partsNeedingFlip(parts).map((p) => p.id));
  const cabinetName = new Map(params.cabinets.map((c) => [c.id, c.name]));
  const carcassName = new Map(
    params.cabinets.flatMap((c) => c.carcasses.map((k) => [`${c.id}/${k.id}`, k.name] as const)),
  );

  return parts.map((part) => {
    const sheet = params.materials.find((m) => m.id === part.materialId);
    const stock = sheet ? undefined : params.stockMaterials.find((m) => m.id === part.materialId);
    const size = sheet ? blankSize(part, sheet) : bboxSize(part);
    const forced = part.features.find(forcesFace);

    return {
      id: part.id,
      description: part.label,
      role: part.role,
      cabinet: cabinetName.get(part.cabinetId) ?? part.cabinetId,
      carcass: carcassName.get(`${part.cabinetId}/${part.carcassId}`) ?? part.carcassId,
      material: sheet?.name ?? stock?.name ?? part.materialId,
      thickness: round(part.thickness),
      length: round(Math.max(size.w, size.h)),
      width: round(Math.min(size.w, size.h)),
      faceUp: forced ? forced.side : 'either',
      flipped: flipped.has(part.id),
    };
  });
}

function bboxSize(part: Part): { w: number; h: number } {
  const bb = bboxOf(part.outline);
  return { w: bb.maxX - bb.minX, h: bb.maxY - bb.minY };
}

const round = (n: number): number => Math.round(n * 10) / 10;

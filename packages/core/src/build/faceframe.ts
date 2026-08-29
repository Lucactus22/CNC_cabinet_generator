import { rect } from '../geom/index.js';
import { localFrame } from '../model/frame.js';
import type { AABB, FaceFrameSpec, GrainAxis, StockMaterial } from '../model/types.js';
import type { FrontOpening } from './doors.js';
import type { BuildSink } from './builder.js';

export interface FaceFrameContext {
  cabinetId: string;
  carcassId: string;
  /** `${cabinetId}-${carcassId}`, the prefix every part id in this carcass shares. */
  prefix: string;
  human: string;
  /** Assembly-space left and right faces of the carcass. */
  xL: number;
  xR: number;
  /** Carcass's own front face. The frame sits proud of it, towards the room. */
  yFront: number;
  /** Vertical span the frame covers — the same window doors already run in. */
  zBottom: number;
  zTop: number;
}

export interface FaceFrameResult {
  /** One opening per bay, in bay order. */
  openings: FrontOpening[];
  /** The stile bounding a bay on a given side, for a hinge's mounting plate. */
  stileFor: (bayIndex: number, side: 'left' | 'right') => string;
  /** Assembly-space Y of the frame's own front face, which a door fronts instead of the carcass. */
  frontY: number;
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): AABB => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/**
 * A frame of solid stock across the front of a carcass: two outer stiles, one
 * mid-stile per divider, and a rail top and bottom.
 *
 * Stiles run the frame's full height and rails its full width, so every
 * stile-rail crossing — including a mid-stile's, not just the two corners —
 * is the same half lap (`joinery/halflap.ts`). Letting rails run only between
 * the outer stiles and coping mid-stiles into them instead would need two
 * different joints for what is structurally one relationship; this needs one.
 *
 * Returns the opening each bay's door is fitted to — bounded by the stiles
 * and rails now standing in front of the carcass, not the carcass opening
 * itself — and where a hinge's mounting plate lands.
 */
export function buildFaceFrame(
  ctx: FaceFrameContext,
  ff: FaceFrameSpec,
  material: StockMaterial,
  bays: Array<{ x0: number; x1: number }>,
  /** Assembly-space centreline of each divider, already resolved to a stile's own X. */
  dividerCentres: number[],
  sink: BuildSink,
): FaceFrameResult {
  const { parts, joints, notes } = sink;
  const t = material.actualThickness;
  // The frame's back face sits flush against the carcass front; its own front
  // face stands proud of it, towards the room — the same Y a door's back
  // sits at under overlay.
  const y1 = ctx.yFront;
  const y0 = y1 - t;
  const sw = ff.stileWidth;
  const rw = ff.railWidth;

  const add = (
    id: string,
    label: string,
    role: 'stile' | 'rail',
    b: AABB,
    grainAxis: GrainAxis,
  ): void => {
    parts.push({
      id,
      label,
      role,
      cabinetId: ctx.cabinetId,
      carcassId: ctx.carcassId,
      materialId: material.id,
      thickness: t,
      box: b,
      normalAxis: 'y',
      faceASign: '+',
      frame: localFrame(b, 'y', '+'),
      width: 0,
      height: 0,
      exposed: { x: 0, y: 0, w: 0, h: 0 },
      outline: rect(0, 0, 0, 0),
      features: [],
      grainAxis,
    });
  };

  const leftId = `${ctx.prefix}-STILE-L`;
  const rightId = `${ctx.prefix}-STILE-R`;
  add(
    leftId,
    `${ctx.human} stile, left`,
    'stile',
    box(ctx.xL, ctx.xL + sw, y0, y1, ctx.zBottom, ctx.zTop),
    'v',
  );
  add(
    rightId,
    `${ctx.human} stile, right`,
    'stile',
    box(ctx.xR - sw, ctx.xR, y0, y1, ctx.zBottom, ctx.zTop),
    'v',
  );

  const midIds = dividerCentres.map((centre, i) => {
    const id = `${ctx.prefix}-STILE-M${i + 1}`;
    add(
      id,
      `${ctx.human} mid-stile ${i + 1}`,
      'stile',
      box(centre - sw / 2, centre + sw / 2, y0, y1, ctx.zBottom, ctx.zTop),
      'v',
    );
    return id;
  });

  const topId = `${ctx.prefix}-RAIL-TOP`;
  const bottomId = `${ctx.prefix}-RAIL-BOTTOM`;
  add(
    topId,
    `${ctx.human} top rail`,
    'rail',
    box(ctx.xL, ctx.xR, y0, y1, ctx.zTop - rw, ctx.zTop),
    'u',
  );
  add(
    bottomId,
    `${ctx.human} bottom rail`,
    'rail',
    box(ctx.xL, ctx.xR, y0, y1, ctx.zBottom, ctx.zBottom + rw),
    'u',
  );

  for (const stileId of [leftId, rightId, ...midIds]) {
    joints.push({ maleId: stileId, femaleId: topId, purpose: 'face-frame' });
    joints.push({ maleId: stileId, femaleId: bottomId, purpose: 'face-frame' });
  }

  if (ctx.zTop - ctx.zBottom < rw * 2 + 1e-6) {
    notes.push(
      `${ctx.human}: the face frame's top and bottom rails, ${rw} mm each, do not both fit in the ${(ctx.zTop - ctx.zBottom).toFixed(0)} mm the doors run in.`,
    );
  }

  // Fenceposts: outer-left stile, one per divider, outer-right stile — one
  // more than there are bays, same as `dividerIds` sits between `leftId` and
  // `rightId` for the carcass itself.
  const stileRanges: Array<{ id: string; x0: number; x1: number }> = [
    { id: leftId, x0: ctx.xL, x1: ctx.xL + sw },
    ...midIds.map((id, i) => ({
      id,
      x0: dividerCentres[i]! - sw / 2,
      x1: dividerCentres[i]! + sw / 2,
    })),
    { id: rightId, x0: ctx.xR - sw, x1: ctx.xR },
  ];

  // Clamped to the member's own width: a door cannot overlay past the outer
  // edge of the stile or rail it is landing on without hanging in thin air.
  const overlayX = Math.min(ff.overlay, sw);
  const overlayZ = Math.min(ff.overlay, rw);
  if (overlayX < ff.overlay || overlayZ < ff.overlay) {
    notes.push(
      `${ctx.human}: a ${ff.overlay} mm door overlay is wider than the frame member it lands on, so it was held to the frame's own outer edge instead.`,
    );
  }

  const clearZ0 = ctx.zBottom + rw;
  const clearZ1 = ctx.zTop - rw;
  const openings: FrontOpening[] = bays.map((_, i) => {
    const clearX0 = stileRanges[i]!.x1;
    const clearX1 = stileRanges[i + 1]!.x0;
    return {
      clearX0,
      clearX1,
      clearZ0,
      clearZ1,
      overlayX0: clearX0 - overlayX,
      overlayX1: clearX1 + overlayX,
      overlayZ0: clearZ0 - overlayZ,
      overlayZ1: clearZ1 + overlayZ,
    };
  });

  const stileFor = (bayIndex: number, side: 'left' | 'right'): string =>
    side === 'left' ? stileRanges[bayIndex]!.id : stileRanges[bayIndex + 1]!.id;

  return { openings, stileFor, frontY: y0 };
}

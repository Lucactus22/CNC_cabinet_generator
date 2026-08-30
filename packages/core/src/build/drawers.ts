import { rect } from '../geom/index.js';
import { localFrame } from '../model/frame.js';
import type { AABB, DoorFit, GrainAxis, Material, PartRole } from '../model/types.js';
import type { SlideEntry } from '../hardware/catalogue.js';
import { doorLeafRect, splitOpeningVertically, type FrontOpening } from './doors.js';
import type { BuildSink, DrawerBottomNotchRequest, SlideRequest } from './builder.js';

export interface DrawerStackContext {
  cabinetId: string;
  carcassId: string;
  /** `${cabinetId}-${carcassId}`, the prefix every part id in this carcass shares. */
  prefix: string;
  human: string;
  bayIndex: number;
  /** Carcass or frame front face — whatever the drawer face fronts, the same as a door does. */
  yFront: number;
  /** Front face of the back panel: how far a drawer box may reach. */
  innerBackY: number;
  /** Panels bounding this bay, that the runner's cabinet-side member screws to. */
  panelLeftId: string;
  panelRightId: string;
}

/** Blum 563H/563F: "minimum top clearance 6 (1/4")" between the box and the top of the opening. */
const TOP_CLEARANCE = 6;

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): AABB => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/**
 * Largest nominal running length the slide ships in that fits the available
 * depth, or the shortest one if none do — built anyway, so a bay that is too
 * shallow gets a drawer that says so rather than no drawer at all.
 */
function pickLength(available: number, entry: SlideEntry): { length: number; fits: boolean } {
  const lengths = entry.boring.nominalLengths;
  const fitting = lengths.filter((l) => l + entry.boring.lengthClearance <= available);
  if (fitting.length > 0) return { length: Math.max(...fitting), fits: true };
  return { length: Math.min(...lengths), fits: false };
}

/**
 * One bay's stack of drawers: a box — sides, a sub-front, a back and a
 * bottom — and a visible face per drawer, top to bottom.
 *
 * The box's sides are the panels that grow: they reach forward into a pocket
 * in the sub-front and back into one in the back, the same relationship a
 * capped top's sides have with the top panel (`buildCarcass`'s own capped-top
 * joints). That is what keeps the sub-front's and back's own widths stable
 * through the rest of the pipeline — nothing grows them — which is exactly
 * the number `hardware/fit.ts` checks a box's width against; a captured
 * panel's box is not a stable thing to measure once joinery has grown it.
 *
 * The bottom is captured the ordinary way, into the sides alone: its front
 * edge simply meets the sub-front unjointed, and its rear reaches the box's
 * true back from the start, clear for the slide's locking device and the
 * notch it needs. That is also why the back is shorter than the sides,
 * stopping `bottomRecess` above the floor of the box, rather than running
 * their full height. See docs/DRAWERS.md for the sourcing and the
 * simplifications against Blum's own drawings.
 */
export function buildDrawerStack(
  ctx: DrawerStackContext,
  opening: FrontOpening,
  explicitHeights: number[],
  fit: DoorFit,
  reveal: number,
  insetGap: number,
  boxMaterial: Material,
  boxThickness: number,
  faceMaterial: Material,
  slide: SlideEntry,
  sink: BuildSink,
): void {
  const { parts, joints, notes } = sink;
  const faceOpenings = splitOpeningVertically(opening, explicitHeights, fit);
  const td = faceMaterial.actualThickness;
  const bt = boxThickness;
  const clearOpeningWidth = opening.clearX1 - opening.clearX0;

  const add = (
    id: string,
    label: string,
    role: PartRole,
    materialId: string,
    thickness: number,
    b: AABB,
    normalAxis: 'x' | 'y' | 'z',
    faceASign: '+' | '-',
    grainAxis: GrainAxis,
  ): void => {
    parts.push({
      id,
      label,
      role,
      cabinetId: ctx.cabinetId,
      carcassId: ctx.carcassId,
      materialId,
      thickness,
      box: b,
      normalAxis,
      faceASign,
      frame: localFrame(b, normalAxis, faceASign),
      width: 0,
      height: 0,
      exposed: { x: 0, y: 0, w: 0, h: 0 },
      outline: rect(0, 0, 0, 0),
      features: [],
      grainAxis,
      bandedEdges: [],
    });
  };

  faceOpenings.forEach((faceOpening, k) => {
    const faceRect = doorLeafRect(faceOpening, fit, reveal, insetGap);
    const faceHeight = faceRect.z1 - faceRect.z0;
    if (faceRect.x1 - faceRect.x0 <= 0 || faceHeight <= 0) return;
    const num = k + 1;
    const partId = (suffix: string): string =>
      `${ctx.prefix}-DRAWER-${ctx.bayIndex + 1}-${num}${suffix}`;
    const label = (what: string): string =>
      `${ctx.human} drawer ${num}, bay ${ctx.bayIndex + 1}${what}`;

    // --- Face -------------------------------------------------------------
    // The same kind of part as a door: fitted from the opening slice with
    // `doorLeafRect`, so surface effects target it exactly as they would a
    // door, on the same 'inside'/'outside' faces.
    const yFace0 = fit === 'overlay' ? ctx.yFront - td : ctx.yFront;
    const faceId = partId('-FACE');
    add(
      faceId,
      label(''),
      'drawer-face',
      faceMaterial.id,
      td,
      box(faceRect.x0, faceRect.x1, yFace0, yFace0 + td, faceRect.z0, faceRect.z1),
      'y',
      '+',
      'v',
    );

    // --- Box ----------------------------------------------------------------
    const outsideWidth = clearOpeningWidth - slide.boring.widthDeduction + 2 * bt;
    if (outsideWidth <= 2 * bt) {
      notes.push(
        `${label('')}: the bay is too narrow for a ${slide.name} box once its own sides are allowed for — no box was built for this drawer.`,
      );
      return;
    }
    const boxX0 = opening.clearX0 + (clearOpeningWidth - outsideWidth) / 2;
    const boxX1 = boxX0 + outsideWidth;
    const boxY0 = yFace0 + td;
    const available = ctx.innerBackY - boxY0;
    const { length, fits } = pickLength(available, slide);
    if (!fits) {
      const shortest = Math.min(...slide.boring.nominalLengths);
      notes.push(
        `${label('')}: this carcass is too shallow for even the shortest ${slide.name} runner (${shortest} mm, needing about ${(shortest + slide.boring.lengthClearance).toFixed(0)} mm of depth to fit) — the box was built to it anyway, but the runner will not sit right.`,
      );
    }
    const boxY1 = boxY0 + length;
    const boxZ0 = faceRect.z0;
    const boxHeight = Math.max(20, faceHeight - TOP_CLEARANCE);
    const boxZ1 = boxZ0 + boxHeight;
    // The bottom is cut from the same material as the sides, so it is not
    // always thinner than the slide's own published recess: a 563F box in
    // 18 mm sides needs more clearance than Blum's 13 mm figure alone would
    // give it, or the back would overlap the bottom instead of clearing it.
    const recess = Math.max(slide.boring.bottomRecess, bt);

    const leftId = partId('-SIDE-L');
    const rightId = partId('-SIDE-R');
    const frontId = partId('-FRONT');
    const backId = partId('-BACK');
    const bottomId = partId('-BOTTOM');

    // Sides are built at the box's clear length; the side-to-front and
    // side-to-back joints below grow them the rest of the way, exactly as a
    // shelf grows into the carcass sides that capture it.
    add(
      leftId,
      label(', left side'),
      'drawer-side',
      boxMaterial.id,
      bt,
      box(boxX0, boxX0 + bt, boxY0 + bt, boxY1 - bt, boxZ0, boxZ1),
      'x',
      '+',
      'v',
    );
    add(
      rightId,
      label(', right side'),
      'drawer-side',
      boxMaterial.id,
      bt,
      box(boxX1 - bt, boxX1, boxY0 + bt, boxY1 - bt, boxZ0, boxZ1),
      'x',
      '-',
      'v',
    );
    add(
      frontId,
      label(', sub-front'),
      'drawer-front',
      boxMaterial.id,
      bt,
      box(boxX0, boxX1, boxY0, boxY0 + bt, boxZ0, boxZ1),
      'y',
      '+',
      'v',
    );
    // Shorter than the sides: its bottom edge stops `bottomRecess` above the
    // floor of the box, so it never reaches into the zone the runner's own
    // hardware and the bottom's rear notch occupy.
    add(
      backId,
      label(', back'),
      'drawer-back',
      boxMaterial.id,
      bt,
      box(boxX0, boxX1, boxY1 - bt, boxY1, boxZ0 + recess, boxZ1),
      'y',
      '-',
      'v',
    );
    // Built reaching the box's true rear from the start — there is no back-
    // panel joint to grow it there, and its rear corners get notched next.
    add(
      bottomId,
      label(', bottom'),
      'drawer-bottom',
      boxMaterial.id,
      bt,
      box(boxX0 + bt, boxX1 - bt, boxY0 + bt, boxY1, boxZ0, boxZ0 + bt),
      'z',
      '+',
      'u',
    );

    joints.push({ maleId: leftId, femaleId: frontId, purpose: 'drawer-box' });
    joints.push({ maleId: rightId, femaleId: frontId, purpose: 'drawer-box' });
    joints.push({ maleId: leftId, femaleId: backId, purpose: 'drawer-box-back' });
    joints.push({ maleId: rightId, femaleId: backId, purpose: 'drawer-box-back' });
    // Always a plain housing joint, whatever the project's carcass joint is
    // set to: a captured bottom is universal even in a finger-jointed box, the
    // same reasoning JOINERY.md gives for a carcass's own back panel. Grown
    // out to the box's true rear rather than left wherever the bottom's own
    // (already full-length) box happens to land, so the groove cannot fall
    // short of it depending on what order the earlier joints ran in.
    joints.push({
      maleId: bottomId,
      femaleId: leftId,
      purpose: 'drawer-box-bottom',
      forceDado: true,
      openEdgeAtY: boxY1,
    });
    joints.push({
      maleId: bottomId,
      femaleId: rightId,
      purpose: 'drawer-box-bottom',
      forceDado: true,
      openEdgeAtY: boxY1,
    });

    const notch: DrawerBottomNotchRequest = {
      panelId: bottomId,
      width: slide.boring.bottomNotchWidth,
      depth: recess,
    };
    sink.drawerNotches.push(notch);

    const slideReq: SlideRequest = {
      boxLeftId: leftId,
      boxRightId: rightId,
      panelLeftId: ctx.panelLeftId,
      panelRightId: ctx.panelRightId,
      // The box's own front, not the carcass's: these differ by the door
      // material's thickness under inset fit, and a mounting hole measured
      // from the wrong one lands off the edge of the side panel.
      boxFrontY: boxY0,
      length,
      mountInset: slide.boring.mountInset,
      screwDiameter: slide.boring.screwDiameter,
      z: boxZ0 + recess / 2,
    };
    sink.slides.push(slideReq);
  });
}

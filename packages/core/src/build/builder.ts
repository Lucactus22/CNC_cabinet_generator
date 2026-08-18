import { rect } from '../geom/index.js';
import type {
  AABB,
  Axis,
  GrainAxis,
  CabinetParams,
  CarcassSpec,
  Material,
  Part,
  PartRole,
  Sign,
  ToeKickSpec,
} from '../model/types.js';
import { localFrame } from '../model/frame.js';
import { layoutBays, pinHeights, shelfHeights } from './layout.js';

/**
 * A joint the joinery stage has to realise. The builder decides *what* meets
 * *what*; the joinery strategies decide what that looks like in the material.
 */
export interface JointRequest {
  maleId: string;
  femaleId: string;
  /** Overrides the standard dado depth, for shallower locating grooves. */
  depthOverride?: number;
  /** Carcass joints stop short of this assembly Y so nothing shows on the front edge. */
  stopFrontAtY?: number;
  purpose: 'carcass' | 'shelf' | 'back' | 'divider' | 'toe-rail';
  /** Backs and toe rails always sit in a plain groove, whatever the carcass joint is. */
  forceDado?: boolean;
}

export interface BuildResult {
  parts: Part[];
  joints: JointRequest[];
  /** Adjustable-shelf pin rows, resolved to concrete holes by the joinery stage. */
  pinRows: PinRowRequest[];
  /** Toe kick cut-outs, resolved against each panel's own frame by the joinery stage. */
  toeNotches: ToeNotchRequest[];
  notes: string[];
}

/**
 * The toe kick, cut straight out of the side panels rather than built as a
 * separate plinth: one less sub-assembly, and the notch costs nothing extra to
 * machine since the panel is being profiled anyway.
 */
export interface ToeNotchRequest {
  panelId: string;
  /** Measured back from the carcass front face. */
  setback: number;
  /** Measured up from the carcass floor. */
  height: number;
}

export interface PinRowRequest {
  /** Panel that gets drilled. */
  panelId: string;
  /** Assembly-space heights of each hole. */
  heights: number[];
  /** Front and rear rows, as assembly-space Y positions. */
  ys: number[];
  /** Centre of the bay being served, so the holes land on the face that needs them. */
  bayCentreX: number;
}

interface CarcassContext {
  which: 'base' | 'top';
  spec: CarcassSpec;
  toeKick: ToeKickSpec | null;
  /** Assembly-space front face of this carcass. */
  yFront: number;
  /** Assembly-space floor of this carcass. */
  z0: number;
  /**
   * Panel this carcass stands on instead of having a bottom of its own. When
   * set, no bottom panel is built and everything that would have landed in one
   * lands in shallow dados in this panel instead.
   */
  standsOnId: string | null;
}

const box = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): AABB => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

export function buildParts(params: CabinetParams): BuildResult {
  const carcassMat = findMaterial(params, params.carcassMaterialId);
  const shelfMat = findMaterial(params, params.shelfMaterialId);
  const t = carcassMat.actualThickness;

  const parts: Part[] = [];
  const joints: JointRequest[] = [];
  const pinRows: PinRowRequest[] = [];
  const toeNotches: ToeNotchRequest[] = [];
  const notes: string[] = [];

  const baseDepth = params.base.depth;
  const topWidth = params.top.linkWidthToBase ? params.base.width : params.top.width;
  const topSpec: CarcassSpec = { ...params.top, width: topWidth };

  // Rear faces are flush against the wall, so the shallower upper carcass is
  // set back at the front. That step is what forms the ledge in the reference
  // photographs.
  const topFrontY = baseDepth - topSpec.depth;

  const contexts: CarcassContext[] = [
    {
      which: 'base',
      spec: params.base,
      toeKick: params.base.toeKick.enabled ? params.base.toeKick : null,
      yFront: 0,
      z0: 0,
      standsOnId: null,
    },
    {
      which: 'top',
      spec: topSpec,
      toeKick: null,
      yFront: topFrontY,
      // The upper carcass sits directly on the base's top panel.
      z0: params.base.height,
      // With no bottom of its own it stands in that panel, which the base
      // carcass has already built by the time we get here.
      standsOnId: params.top.floor === 'base-top' ? 'B-TOP' : null,
    },
  ];

  for (const ctx of contexts) {
    buildCarcass(ctx, params, carcassMat, shelfMat, t, parts, joints, pinRows, toeNotches, notes);
  }

  if (params.top.floor === 'base-top' && params.base.topStyle === 'inset') {
    // An inset top only spans the clear opening, so the upper's sides would
    // land half on it and half on the end grain of the base's own sides,
    // leaving the locating dado a fraction of its intended width.
    notes.push(
      'The upper carcass stands on the base top, but that panel is inset between the base sides, so it does not reach under the upper sides. Cap the base top so it laps over them.',
    );
  }

  if (topSpec.depth > baseDepth) {
    notes.push(
      'The upper carcass is deeper than the base, so it overhangs at the front instead of stepping back.',
    );
  }

  return { parts, joints, pinRows, toeNotches, notes };
}

function buildCarcass(
  ctx: CarcassContext,
  params: CabinetParams,
  carcassMat: Material,
  shelfMat: Material,
  t: number,
  parts: Part[],
  joints: JointRequest[],
  pinRows: PinRowRequest[],
  toeNotches: ToeNotchRequest[],
  notes: string[],
): void {
  const { spec, which, yFront, z0 } = ctx;
  const W = spec.width;
  const H = spec.height;
  const D = spec.depth;
  const yBack = yFront + D;
  const zTop = z0 + H;
  const prefix = which === 'base' ? 'B' : 'T';
  const human = which === 'base' ? 'Base' : 'Upper';

  const backMat = spec.back.style === 'none' ? null : findMaterial(params, spec.back.materialId);
  const backT = backMat?.actualThickness ?? 0;

  // Front face of the back panel: everything inside the carcass stops here.
  const innerBackY = spec.back.style === 'none' ? yBack : yBack - spec.back.inset - backT;

  const toeH = ctx.toeKick?.height ?? 0;
  // Standing on the panel below means its top face is this carcass's floor.
  const hasOwnBottom = ctx.standsOnId === null;
  const shelfZ0 = hasOwnBottom ? z0 + toeH + t : z0;
  const shelfZ1 = zTop - t; // underside of the top panel

  const add = (
    id: string,
    label: string,
    role: PartRole,
    materialId: string,
    thickness: number,
    b: AABB,
    normalAxis: Axis,
    faceASign: Sign,
    grainAxis: GrainAxis,
  ): Part => {
    const part: Part = {
      id,
      label,
      role,
      carcass: which,
      materialId,
      thickness,
      box: b,
      normalAxis,
      faceASign,
      // Taken now, while the box is still the clear opening. Joinery grows the
      // box into its grooves next, and the frame must not move with it.
      frame: localFrame(b, normalAxis, faceASign),
      width: 0,
      height: 0,
      exposed: { x: 0, y: 0, w: 0, h: 0 },
      outline: rect(0, 0, 0, 0),
      features: [],
      grainAxis,
    };
    parts.push(part);
    return part;
  };

  // --- Sides -------------------------------------------------------------
  // A capped top lies over the sides, so they stop at its underside.
  const capped = spec.topStyle === 'capped';
  const sideTop = capped ? zTop - t : zTop;
  const leftId = `${prefix}-SIDE-L`;
  const rightId = `${prefix}-SIDE-R`;
  add(leftId, `${human} side, left`, 'side', carcassMat.id, t,
    box(0, t, yFront, yBack, z0, sideTop), 'x', '+', 'v');
  add(rightId, `${human} side, right`, 'side', carcassMat.id, t,
    box(W - t, W, yFront, yBack, z0, sideTop), 'x', '-', 'v');

  // --- Bottom and top panels ---------------------------------------------
  // Sized to the clear opening; the joinery stage grows them into their dados.
  const topId = `${prefix}-TOP`;
  add(topId, `${human} top`, 'top', carcassMat.id, t,
    box(capped ? 0 : t, capped ? W : W - t, yFront, yBack, zTop - t, zTop), 'z', '-', 'u');

  if (capped) {
    // The sides run up into shallow dados in the top's underside. That is the
    // face already being machined for the dividers and the back, so capping
    // costs no extra setup. The dado stops short of the front, because the
    // panel's front edge is on show.
    for (const maleId of [leftId, rightId]) {
      joints.push({
        maleId,
        femaleId: topId,
        stopFrontAtY: yFront,
        purpose: 'carcass',
        forceDado: true,
        depthOverride: params.joinery.stackDadoDepth,
      });
    }
  } else {
    for (const femaleId of [leftId, rightId]) {
      joints.push({ maleId: topId, femaleId, stopFrontAtY: yFront, purpose: 'carcass' });
    }
  }

  const bottomId = `${prefix}-BOTTOM`;
  if (hasOwnBottom) {
    const bottomZ = z0 + toeH;
    add(bottomId, `${human} bottom`, 'bottom', carcassMat.id, t,
      box(t, W - t, yFront, yBack, bottomZ, bottomZ + t), 'z', '+', 'u');
    for (const femaleId of [leftId, rightId]) {
      joints.push({ maleId: bottomId, femaleId, stopFrontAtY: yFront, purpose: 'carcass' });
    }
  } else {
    // No bottom panel: the sides stand in shallow dados in the panel below.
    // Reusing the housing joint means they grow into those dados and get their
    // front corners notched to hide them, exactly as any other captured panel
    // does. The dado has to stop short of the front, because that panel's front
    // edge is the visible ledge.
    for (const maleId of [leftId, rightId]) {
      joints.push({
        maleId,
        femaleId: ctx.standsOnId!,
        stopFrontAtY: yFront,
        purpose: 'carcass',
        forceDado: true,
        depthOverride: params.joinery.stackDadoDepth,
      });
    }
    notes.push(
      `${human} carcass has no bottom panel: it stands in ${params.joinery.stackDadoDepth} mm locating dados in the panel below. Glue it in place, and note that panel is now machined on both faces.`,
    );
  }

  /** Whatever forms this carcass's floor, for anything that has to land on it. */
  const floorId = hasOwnBottom ? bottomId : ctx.standsOnId!;
  const floorJoint = (maleId: string): JointRequest => ({
    maleId,
    femaleId: floorId,
    stopFrontAtY: yFront,
    purpose: hasOwnBottom ? 'divider' : 'carcass',
    ...(hasOwnBottom ? {} : { forceDado: true, depthOverride: params.joinery.stackDadoDepth }),
  });

  // --- Toe kick ----------------------------------------------------------
  if (ctx.toeKick) {
    for (const panelId of [leftId, rightId]) {
      toeNotches.push({ panelId, setback: ctx.toeKick.setback, height: ctx.toeKick.height });
    }
    if (ctx.toeKick.height >= H) {
      notes.push(`${human} carcass: the toe kick is as tall as the carcass itself.`);
    }
    const railId = `${prefix}-TOERAIL`;
    const railY = yFront + ctx.toeKick.setback;
    add(railId, `${human} toe kick rail`, 'toe-rail', carcassMat.id, t,
      box(t, W - t, railY, railY + t, z0, z0 + toeH), 'y', '-', 'u');
    for (const femaleId of [leftId, rightId]) {
      joints.push({ maleId: railId, femaleId, purpose: 'toe-rail', forceDado: true });
    }
  }

  // --- Dividers ----------------------------------------------------------
  const { bays, dividerX, fellBackToEven } = layoutBays(spec, t);
  if (fellBackToEven) {
    notes.push(
      `${human} carcass: the explicit bay widths did not add up to the interior width, so bays were split evenly.`,
    );
  }

  const dividerIds: string[] = [];
  dividerX.forEach((x, i) => {
    const id = `${prefix}-DIV-${i + 1}`;
    dividerIds.push(id);
    add(id, `${human} divider ${i + 1}`, 'divider', carcassMat.id, t,
      box(x, x + t, yFront, innerBackY, shelfZ0, shelfZ1), 'x', '+', 'v');
    joints.push(floorJoint(id));
    joints.push({ maleId: id, femaleId: topId, stopFrontAtY: yFront, purpose: 'divider' });
  });

  // --- Shelves -----------------------------------------------------------
  bays.forEach((bay, i) => {
    const baySpec = spec.bays[i] ?? spec.bays[spec.bays.length - 1] ?? {
      shelves: 'none' as const,
      shelfCount: 0,
    };
    // Whichever panels bound this bay: outer sides at the ends, dividers within.
    const leftPanel = i === 0 ? leftId : dividerIds[i - 1]!;
    const rightPanel = i === bays.length - 1 ? rightId : dividerIds[i]!;

    if (baySpec.shelves === 'fixed' && baySpec.shelfCount > 0) {
      const zs = shelfHeights(shelfZ0, shelfZ1, baySpec.shelfCount, t);
      zs.forEach((z, k) => {
        const id = `${prefix}-SHELF-${i + 1}-${k + 1}`;
        add(id, `${human} shelf, bay ${i + 1} no ${k + 1}`, 'shelf', shelfMat.id,
          shelfMat.actualThickness,
          box(bay.x0, bay.x1, yFront, innerBackY, z, z + shelfMat.actualThickness),
          'z', '+', 'u');
        joints.push({ maleId: id, femaleId: leftPanel, stopFrontAtY: yFront, purpose: 'shelf' });
        joints.push({ maleId: id, femaleId: rightPanel, stopFrontAtY: yFront, purpose: 'shelf' });
      });
    }

    if (baySpec.shelves === 'adjustable') {
      const pin = params.joinery.shelfPin;
      const heights = pinHeights(shelfZ0, shelfZ1, pin);
      const ys = [yFront + pin.frontOffset, innerBackY - pin.backOffset].filter(
        (y) => y > yFront && y < innerBackY,
      );
      if (heights.length > 0 && ys.length > 0) {
        const bayCentreX = (bay.x0 + bay.x1) / 2;
        for (const panelId of [leftPanel, rightPanel]) {
          pinRows.push({ panelId, heights, ys, bayCentreX });
        }
        // One loose shelf per bay as a starting point, sized to drop in freely.
        const clearance = 2;
        const id = `${prefix}-SHELF-ADJ-${i + 1}`;
        add(id, `${human} adjustable shelf, bay ${i + 1}`, 'shelf', shelfMat.id,
          shelfMat.actualThickness,
          box(bay.x0 + clearance / 2, bay.x1 - clearance / 2, yFront + clearance,
            innerBackY, shelfZ0 + 200, shelfZ0 + 200 + shelfMat.actualThickness),
          'z', '+', 'u');
      } else {
        notes.push(
          `${human} carcass bay ${i + 1}: the opening is too short for a shelf pin ladder, so no holes were drilled.`,
        );
      }
    }
  });

  // --- Back --------------------------------------------------------------
  if (backMat && spec.back.style !== 'none') {
    const backY1 = yBack - spec.back.inset;
    const backId = `${prefix}-BACK`;
    // Sized to the clear opening. If it sits in grooves, the joinery stage
    // grows it into them, exactly as it does for every other captured panel.
    add(backId, `${human} back`, 'back', backMat.id, backT,
      box(t, W - t, backY1 - backT, backY1, shelfZ0, shelfZ1), 'y', '-', 'free');
    if (spec.back.style === 'groove') {
      for (const femaleId of [leftId, rightId, topId]) {
        joints.push({ maleId: backId, femaleId, purpose: 'back', forceDado: true });
      }
      // The back's bottom edge sits in the floor, whichever panel that is.
      joints.push(
        hasOwnBottom
          ? { maleId: backId, femaleId: bottomId, purpose: 'back', forceDado: true }
          : {
              maleId: backId,
              femaleId: floorId,
              purpose: 'back',
              forceDado: true,
              depthOverride: params.joinery.stackDadoDepth,
            },
      );
    }
  }
}

export function findMaterial(params: CabinetParams, id: string): Material {
  const m = params.materials.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown material '${id}'. Check the materials list.`);
  return m;
}

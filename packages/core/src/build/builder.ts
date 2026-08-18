import { rect } from '../geom/index.js';
import type {
  AABB,
  Axis,
  CabinetParams,
  CarcassSpec,
  Material,
  Part,
  PartRole,
  Sign,
  ToeKickSpec,
} from '../model/types.js';
import { layoutBays, pinHeights, shelfHeights } from './layout.js';

/**
 * A joint the joinery stage has to realise. The builder decides *what* meets
 * *what*; the joinery strategies decide what that looks like in the material.
 */
export interface JointRequest {
  maleId: string;
  femaleId: string;
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
    },
    {
      which: 'top',
      spec: topSpec,
      toeKick: null,
      yFront: topFrontY,
      // The upper carcass sits directly on the base's top panel.
      z0: params.base.height,
    },
  ];

  for (const ctx of contexts) {
    buildCarcass(ctx, params, carcassMat, shelfMat, t, parts, joints, pinRows, toeNotches, notes);
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
  const shelfZ0 = z0 + toeH + t; // top of the bottom panel
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
    grainLocked: boolean,
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
      width: 0,
      height: 0,
      outline: rect(0, 0, 0, 0),
      features: [],
      grainLocked,
    };
    parts.push(part);
    return part;
  };

  // --- Sides -------------------------------------------------------------
  const leftId = `${prefix}-SIDE-L`;
  const rightId = `${prefix}-SIDE-R`;
  add(leftId, `${human} side, left`, 'side', carcassMat.id, t,
    box(0, t, yFront, yBack, z0, zTop), 'x', '+', true);
  add(rightId, `${human} side, right`, 'side', carcassMat.id, t,
    box(W - t, W, yFront, yBack, z0, zTop), 'x', '-', true);

  // --- Bottom and top panels ---------------------------------------------
  // Sized to the clear opening; the joinery stage grows them into their dados.
  const bottomId = `${prefix}-BOTTOM`;
  const topId = `${prefix}-TOP`;
  const bottomZ = z0 + toeH;
  add(bottomId, `${human} bottom`, 'bottom', carcassMat.id, t,
    box(t, W - t, yFront, yBack, bottomZ, bottomZ + t), 'z', '+', true);
  add(topId, `${human} top`, 'top', carcassMat.id, t,
    box(t, W - t, yFront, yBack, zTop - t, zTop), 'z', '-', true);

  for (const maleId of [bottomId, topId]) {
    for (const femaleId of [leftId, rightId]) {
      joints.push({ maleId, femaleId, stopFrontAtY: yFront, purpose: 'carcass' });
    }
  }

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
      box(t, W - t, railY, railY + t, z0, z0 + toeH), 'y', '-', true);
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
      box(x, x + t, yFront, innerBackY, shelfZ0, shelfZ1), 'x', '+', true);
    joints.push({ maleId: id, femaleId: bottomId, stopFrontAtY: yFront, purpose: 'divider' });
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
          'z', '+', true);
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
          'z', '+', true);
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
      box(t, W - t, backY1 - backT, backY1, shelfZ0, shelfZ1), 'y', '-', true);
    if (spec.back.style === 'groove') {
      for (const femaleId of [leftId, rightId, bottomId, topId]) {
        joints.push({ maleId: backId, femaleId, purpose: 'back', forceDado: true });
      }
    }
  }
}

export function findMaterial(params: CabinetParams, id: string): Material {
  const m = params.materials.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown material '${id}'. Check the materials list.`);
  return m;
}

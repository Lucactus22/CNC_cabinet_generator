import { rect } from '../geom/index.js';
import type {
  AABB,
  Axis,
  Cabinet,
  Carcass,
  GrainAxis,
  Material,
  Part,
  PartRole,
  ProjectParams,
  Sign,
  ToeKickSpec,
} from '../model/types.js';
import { localFrame } from '../model/frame.js';
import { hingeHeights, layoutBays, pinHeights, shelfHeights, wallMountXs } from './layout.js';

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
  purpose: 'carcass' | 'shelf' | 'back' | 'divider' | 'toe-rail' | 'hanging-rail';
  /** Backs and toe rails always sit in a plain groove, whatever the carcass joint is. */
  forceDado?: boolean;
  /**
   * A rabbet, not a groove: the pocket must run off this assembly Y — the
   * carcass's rear face — rather than stop short of it, so the joint is open
   * on that edge instead of leaving a shoulder behind it.
   */
  openEdgeAtY?: number;
}

export interface BuildResult {
  parts: Part[];
  joints: JointRequest[];
  /** Adjustable-shelf pin rows, resolved to concrete holes by the joinery stage. */
  pinRows: PinRowRequest[];
  /** Toe kick cut-outs, resolved against each panel's own frame by the joinery stage. */
  toeNotches: ToeNotchRequest[];
  /** Doors needing hinge boring. */
  hinges: HingeRequest[];
  /** Screw holes through a hanging rail, for mounting a wall cabinet. */
  wallMounts: WallMountRequest[];
  notes: string[];
}

/** Clearance holes through a hanging rail, resolved to local coordinates by the joinery stage. */
export interface WallMountRequest {
  panelId: string;
  /** Assembly-space X positions of the screw holes along the rail. */
  xs: number[];
  /** Assembly-space Z height all the holes are drilled at: the rail's mid-height. */
  z: number;
  diameter: number;
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

/** A door leaf that needs hinge boring, plus the panel its plates screw to. */
export interface HingeRequest {
  doorId: string;
  /** Panel carrying the mounting plates. */
  carcassPanelId: string;
  /** Assembly-space heights of each hinge's cup centre. */
  heights: number[];
  /** Which side of the door the hinges are on, in assembly X. */
  side: 'low' | 'high';
  /** Front face of the carcass, which the plate holes are measured from. */
  yFront: number;
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
  cabinetId: string;
  /** What this carcass is called in labels and diagnostics; unique in the project. */
  human: string;
  /** Width already resolved, so a carcass linked to the one below reads as itself. */
  spec: Carcass;
  toeKick: ToeKickSpec | null;
  /** Assembly-space left face of this carcass: where its cabinet stands in the run. */
  x0: number;
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

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): AABB => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/** Whichever panels bound bay `i`: outer sides at the ends, dividers within. */
const bayBoundingPanels = (
  i: number,
  bayCount: number,
  leftId: string,
  rightId: string,
  dividerIds: string[],
): { leftPanel: string; rightPanel: string } => ({
  leftPanel: i === 0 ? leftId : dividerIds[i - 1]!,
  rightPanel: i === bayCount - 1 ? rightId : dividerIds[i]!,
});

export function buildParts(params: ProjectParams): BuildResult {
  const carcassMat = findMaterial(params, params.carcassMaterialId);
  const shelfMat = findMaterial(params, params.shelfMaterialId);
  const t = carcassMat.actualThickness;

  const parts: Part[] = [];
  const joints: JointRequest[] = [];
  const pinRows: PinRowRequest[] = [];
  const toeNotches: ToeNotchRequest[] = [];
  const hinges: HingeRequest[] = [];
  const wallMounts: WallMountRequest[] = [];
  const notes: string[] = [];

  // Cabinets stand side by side along the wall, each starting where the one
  // before it ends. Deriving the position from the order rather than storing an
  // offset per cabinet is what makes reordering the list mean something, and
  // makes it impossible to leave two units overlapping each other.
  let xRun = 0;

  /**
   * What to call a carcass in a label or a diagnostic.
   *
   * A name has to identify one panel. With a single cabinet the carcass name
   * does that on its own, and reading "Stacked unit base side, left" would be
   * noise. In a run it does not: three panels all called "Base side, left" is
   * exactly the confusion that gets the wrong one cut down to size.
   */
  const nameOf = (cabinet: Cabinet, carcass: Carcass): string =>
    params.cabinets.length > 1 ? `${cabinet.name} ${carcass.name.toLowerCase()}` : carcass.name;

  for (const cabinet of params.cabinets) {
    const carcasses = resolveWidths(cabinet.carcasses);
    if (carcasses.length === 0) {
      notes.push(`${cabinet.name} has no carcasses in it, so it produces no parts.`);
      continue;
    }

    // Rear faces are flush against the wall, so a shallower carcass is set back
    // at the front. That step is what forms the ledge in the reference
    // photographs.
    const yBack = carcasses[0]!.depth;
    let z0 = 0;

    carcasses.forEach((carcass, k) => {
      const below = carcasses[k - 1];
      const onTheGround = k === 0;
      const human = nameOf(cabinet, carcass);
      // A carcass can only borrow a floor from something underneath it.
      const standsOnBelow = !onTheGround && carcass.floor === 'below';

      if (onTheGround && carcass.floor === 'below') {
        notes.push(
          `${human} stands on the ground, so it was given a bottom panel of its own: there is no carcass below it to stand in.`,
        );
      }
      if (!onTheGround && carcass.toeKick.enabled) {
        notes.push(
          `${human} is not on the floor, so its toe kick was left off: above ground that notch is a recess, not a plinth, and it lands exactly where the panel below has to carry it.`,
        );
      }
      if (standsOnBelow && below!.topStyle === 'inset') {
        // An inset top only spans the clear opening, so the sides above would
        // land half on it and half on the end grain of the lower carcass's own
        // sides, leaving the locating dado a fraction of its intended width.
        notes.push(
          `${human} stands on the ${below!.name.toLowerCase()} top, but that panel is inset between the ${below!.name.toLowerCase()} sides, so it does not reach under its sides. Cap it so it laps over them.`,
        );
      }
      // Measured against the carcass it actually stands on, not against the one
      // on the floor: in a stack of three, a box deeper than the one under it
      // hangs off the panel that is carrying it even when the bottom box is
      // deeper than both.
      if (below && carcass.depth > below.depth + 1e-9) {
        notes.push(
          `${human} is ${(carcass.depth - below.depth).toFixed(0)} mm deeper than the ${below.name.toLowerCase()} it stands on, so it overhangs at the front instead of stepping back.`,
        );
      }

      buildCarcass(
        {
          cabinetId: cabinet.id,
          human,
          spec: carcass,
          toeKick: onTheGround && carcass.toeKick.enabled ? carcass.toeKick : null,
          x0: xRun,
          yFront: yBack - carcass.depth,
          z0,
          // The panel below has already been built by the time we get here.
          standsOnId: standsOnBelow ? `${cabinet.id}-${below!.id}-TOP` : null,
        },
        params,
        carcassMat,
        shelfMat,
        t,
        parts,
        joints,
        pinRows,
        toeNotches,
        hinges,
        wallMounts,
        notes,
      );
      z0 += carcass.height;
    });

    // The widest box in the stack is what the next cabinet has to clear.
    xRun += Math.max(...carcasses.map((c) => c.width));
  }

  return { parts, joints, pinRows, toeNotches, hinges, wallMounts, notes };
}

/**
 * Resolve each carcass's width, following the chain of links down the stack.
 *
 * Done once up front so the rest of the builder never has to ask what a
 * carcass's width really is, and so a link three boxes deep still lands on the
 * width actually set at the bottom.
 */
export function resolveWidths(carcasses: Carcass[]): Carcass[] {
  const out: Carcass[] = [];
  carcasses.forEach((carcass, k) => {
    const below = out[k - 1];
    const width = below && carcass.linkWidthToBelow ? below.width : carcass.width;
    out.push(width === carcass.width ? carcass : { ...carcass, width });
  });
  return out;
}

/** Where each cabinet stands along the run, and how wide its footprint is. */
export function cabinetPositions(cabinets: Cabinet[]): Array<{ id: string; x: number; w: number }> {
  const out: Array<{ id: string; x: number; w: number }> = [];
  let x = 0;
  for (const cabinet of cabinets) {
    const widths = resolveWidths(cabinet.carcasses).map((c) => c.width);
    const w = widths.length > 0 ? Math.max(...widths) : 0;
    out.push({ id: cabinet.id, x, w });
    x += w;
  }
  return out;
}

function buildCarcass(
  ctx: CarcassContext,
  params: ProjectParams,
  carcassMat: Material,
  shelfMat: Material,
  t: number,
  parts: Part[],
  joints: JointRequest[],
  pinRows: PinRowRequest[],
  toeNotches: ToeNotchRequest[],
  hinges: HingeRequest[],
  wallMounts: WallMountRequest[],
  notes: string[],
): void {
  const { spec, yFront, z0 } = ctx;
  const W = spec.width;
  const H = spec.height;
  const D = spec.depth;
  const yBack = yFront + D;
  const zTop = z0 + H;
  // Left and right faces of this carcass, in the run rather than in itself.
  const xL = ctx.x0;
  const xR = ctx.x0 + W;
  const prefix = `${ctx.cabinetId}-${spec.id}`;
  const human = ctx.human;

  const backMat = spec.back.style === 'none' ? null : findMaterial(params, spec.back.materialId);
  const backT = backMat?.actualThickness ?? 0;

  // Front face of the back panel: everything inside the carcass stops here.
  const innerBackY = spec.back.style === 'none' ? yBack : yBack - spec.back.inset - backT;

  const toeH = ctx.toeKick?.height ?? 0;
  // Standing on the panel below means its top face is this carcass's floor.
  const hasOwnBottom = ctx.standsOnId === null;
  const shelfZ0 = hasOwnBottom ? z0 + toeH + t : z0;
  // A hanging rail claims a band under the top the same way a toe kick claims
  // one at the floor: dividers reach the top regardless (they are jointed to
  // it), so it is the storage interior that has to give up the room, not the
  // rail that has to dodge whatever a divider grew into.
  const shelfZ1 = zTop - t - (spec.hangingRail.enabled ? spec.hangingRail.height : 0);

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
      cabinetId: ctx.cabinetId,
      carcassId: spec.id,
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
  add(
    leftId,
    `${human} side, left`,
    'side',
    carcassMat.id,
    t,
    box(xL, xL + t, yFront, yBack, z0, sideTop),
    'x',
    '+',
    'v',
  );
  add(
    rightId,
    `${human} side, right`,
    'side',
    carcassMat.id,
    t,
    box(xR - t, xR, yFront, yBack, z0, sideTop),
    'x',
    '-',
    'v',
  );

  // --- Bottom and top panels ---------------------------------------------
  // Sized to the clear opening; the joinery stage grows them into their dados.
  const topId = `${prefix}-TOP`;
  add(
    topId,
    `${human} top`,
    'top',
    carcassMat.id,
    t,
    box(capped ? xL : xL + t, capped ? xR : xR - t, yFront, yBack, zTop - t, zTop),
    'z',
    '-',
    'u',
  );

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
    add(
      bottomId,
      `${human} bottom`,
      'bottom',
      carcassMat.id,
      t,
      box(xL + t, xR - t, yFront, yBack, bottomZ, bottomZ + t),
      'z',
      '+',
      'u',
    );
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
    add(
      railId,
      `${human} toe kick rail`,
      'toe-rail',
      carcassMat.id,
      t,
      box(xL + t, xR - t, railY, railY + t, z0, z0 + toeH),
      'y',
      '-',
      'u',
    );
    for (const femaleId of [leftId, rightId]) {
      joints.push({ maleId: railId, femaleId, purpose: 'toe-rail', forceDado: true });
    }
  }

  if (spec.hangingRail.enabled && shelfZ1 < shelfZ0 - 1e-9) {
    notes.push(
      `${human} carcass: the ${spec.hangingRail.height} mm hanging rail leaves no room for the carcass interior. Shorten it or make the carcass taller.`,
    );
  }

  // --- Dividers ----------------------------------------------------------
  const layout = layoutBays(spec, t);
  // layoutBays works in the carcass's own coordinates, from its left face at
  // zero. Everything downstream wants assembly space, so shift once, here,
  // rather than remembering to add the offset at a dozen call sites.
  const bays = layout.bays.map((b) => ({ ...b, x0: b.x0 + xL, x1: b.x1 + xL }));
  const dividerX = layout.dividerX.map((x) => x + xL);
  const fellBackToEven = layout.fellBackToEven;
  if (fellBackToEven) {
    notes.push(
      `${human} carcass: the explicit bay widths did not add up to the interior width, so bays were split evenly.`,
    );
  }

  const dividerIds: string[] = [];
  dividerX.forEach((x, i) => {
    const id = `${prefix}-DIV-${i + 1}`;
    dividerIds.push(id);
    add(
      id,
      `${human} divider ${i + 1}`,
      'divider',
      carcassMat.id,
      t,
      // Reaches the true underside of the top, not the reduced shelfZ1: a
      // divider is jointed to the top regardless of a hanging rail, so it
      // ends up there anyway once the joint grows it. Building it there from
      // the start, rather than trusting that growth, is what lets a hanging
      // rail's own dado into this divider find material to cut a pocket in —
      // under carcassJoint: 'tabslot' the divider-to-top joint is a tab, not
      // a dado, and does not grow the box the same way.
      box(x, x + t, yFront, innerBackY, shelfZ0, zTop - t),
      'x',
      '+',
      'v',
    );
    joints.push(floorJoint(id));
    joints.push({ maleId: id, femaleId: topId, stopFrontAtY: yFront, purpose: 'divider' });
  });

  // --- Hanging rail --------------------------------------------------------
  // One segment per bay, bounded by whatever stands either side of it — a
  // divider always reaches the top regardless of shelfZ1 (it is jointed there),
  // so a rail spanning the full width would cross straight through one. A
  // shelf already avoids this by stopping at its own bay; the rail reuses the
  // same bounding-panel logic.
  if (spec.hangingRail.enabled) {
    const hr = spec.hangingRail;
    // Flush with the underside of the top panel, and with the back's inner
    // face, so it fills the corner a screw driven forward from inside the
    // cabinet needs to reach the wall behind.
    const hangZ1 = zTop - t;
    const hangZ0 = hangZ1 - hr.height;
    const hangY1 = innerBackY;
    const hangY0 = hangY1 - t;

    bays.forEach((bay, i) => {
      const { leftPanel, rightPanel } = bayBoundingPanels(
        i,
        bays.length,
        leftId,
        rightId,
        dividerIds,
      );
      const hangId = `${prefix}-HANGRAIL-${i + 1}`;
      add(
        hangId,
        `${human} hanging rail, bay ${i + 1}`,
        'hanging-rail',
        carcassMat.id,
        t,
        box(bay.x0, bay.x1, hangY0, hangY1, hangZ0, hangZ1),
        'y',
        '-',
        'u',
      );
      joints.push({
        maleId: hangId,
        femaleId: leftPanel,
        purpose: 'hanging-rail',
        forceDado: true,
      });
      joints.push({
        maleId: hangId,
        femaleId: rightPanel,
        purpose: 'hanging-rail',
        forceDado: true,
      });
      wallMounts.push({
        panelId: hangId,
        xs: wallMountXs(bay.x0, bay.x1, hr.screwSpacing),
        z: (hangZ0 + hangZ1) / 2,
        diameter: hr.screwDiameter,
      });
    });
  }

  // --- Shelves -----------------------------------------------------------
  bays.forEach((bay, i) => {
    const baySpec = spec.bays[i] ??
      spec.bays[spec.bays.length - 1] ?? {
        shelves: 'none' as const,
        shelfCount: 0,
      };
    const { leftPanel, rightPanel } = bayBoundingPanels(
      i,
      bays.length,
      leftId,
      rightId,
      dividerIds,
    );

    if (baySpec.shelves === 'fixed' && baySpec.shelfCount > 0) {
      const zs = shelfHeights(shelfZ0, shelfZ1, baySpec.shelfCount, t);
      zs.forEach((z, k) => {
        const id = `${prefix}-SHELF-${i + 1}-${k + 1}`;
        add(
          id,
          `${human} shelf, bay ${i + 1} no ${k + 1}`,
          'shelf',
          shelfMat.id,
          shelfMat.actualThickness,
          box(bay.x0, bay.x1, yFront, innerBackY, z, z + shelfMat.actualThickness),
          'z',
          '+',
          'u',
        );
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
        add(
          id,
          `${human} adjustable shelf, bay ${i + 1}`,
          'shelf',
          shelfMat.id,
          shelfMat.actualThickness,
          box(
            bay.x0 + clearance / 2,
            bay.x1 - clearance / 2,
            yFront + clearance,
            innerBackY,
            shelfZ0 + 200,
            shelfZ0 + 200 + shelfMat.actualThickness,
          ),
          'z',
          '+',
          'u',
        );
      } else {
        notes.push(
          `${human} carcass bay ${i + 1}: the opening is too short for a shelf pin ladder, so no holes were drilled.`,
        );
      }
    }
  });

  // --- Doors -------------------------------------------------------------
  const doorMat = params.materials.find((m) => m.id === params.doors.materialId);
  const anyDoors = bays.some((_, i) => (spec.bays[i]?.doors ?? 'none') !== 'none');
  if (anyDoors && !doorMat) {
    notes.push('Doors are switched on but their material is missing from the list.');
  }
  if (anyDoors && doorMat) {
    const d = params.doors;
    const td = doorMat.actualThickness;
    // Overlay doors hang in front of the carcass; inset doors sit in the opening.
    const yDoor0 = d.fit === 'overlay' ? yFront - td : yFront;
    // Vertically the run stops under the top panel, which on a capped carcass
    // is the visible ledge, and above the toe kick.
    const runTop = zTop - t;
    const runBottom = z0 + toeH;

    bays.forEach((bay, i) => {
      const style = spec.bays[i]?.doors ?? 'none';
      if (style === 'none') return;

      let x0: number;
      let x1: number;
      let zBottom: number;
      let zTopDoor: number;
      if (d.fit === 'overlay') {
        // Each door covers half of the panel it shares with its neighbour, and
        // all of an outer side, so the run reads as one continuous front.
        x0 = i === 0 ? xL : dividerX[i - 1]! + t / 2;
        x1 = i === bays.length - 1 ? xR : dividerX[i]! + t / 2;
        x0 += d.reveal / 2;
        x1 -= d.reveal / 2;
        zBottom = runBottom + d.reveal / 2;
        zTopDoor = runTop - d.reveal / 2;
      } else {
        x0 = bay.x0 + d.insetGap;
        x1 = bay.x1 - d.insetGap;
        zBottom = shelfZ0 + d.insetGap;
        zTopDoor = shelfZ1 - d.insetGap;
      }
      if (x1 - x0 <= 0 || zTopDoor - zBottom <= 0) return;

      const leaves: Array<{ from: number; to: number; hingeSide: 'low' | 'high'; suffix: string }> =
        style === 'double'
          ? [
              { from: x0, to: (x0 + x1) / 2 - d.reveal / 2, hingeSide: 'low', suffix: 'L' },
              { from: (x0 + x1) / 2 + d.reveal / 2, to: x1, hingeSide: 'high', suffix: 'R' },
            ]
          : [{ from: x0, to: x1, hingeSide: style === 'left' ? 'low' : 'high', suffix: '' }];

      leaves.forEach((leaf) => {
        if (leaf.to - leaf.from <= 0) return;
        const id = `${prefix}-DOOR-${i + 1}${leaf.suffix}`;
        // Face A is the back, where the hinge cups go; any decoration goes on
        // the front, which is what makes a door a two-sided part.
        add(
          id,
          `${human} door, bay ${i + 1}${leaf.suffix ? ` ${leaf.suffix}` : ''}`,
          'door',
          doorMat.id,
          td,
          box(leaf.from, leaf.to, yDoor0, yDoor0 + td, zBottom, zTopDoor),
          'y',
          '+',
          'v',
        );

        const heights = hingeHeights(zBottom, zTopDoor, params.hinge.endOffset);
        // Plates screw to whichever panel the hinge side runs against.
        const carcassPanelId =
          leaf.hingeSide === 'low'
            ? i === 0
              ? leftId
              : dividerIds[i - 1]!
            : i === bays.length - 1
              ? rightId
              : dividerIds[i]!;
        hinges.push({ doorId: id, carcassPanelId, heights, side: leaf.hingeSide, yFront });
      });
    });
  }

  // --- Back --------------------------------------------------------------
  if (backMat && spec.back.style !== 'none') {
    const backY1 = yBack - spec.back.inset;
    const backId = `${prefix}-BACK`;
    // Sized to the clear opening. If it sits in grooves, the joinery stage
    // grows it into them, exactly as it does for every other captured panel.
    add(
      backId,
      `${human} back`,
      'back',
      backMat.id,
      backT,
      box(xL + t, xR - t, backY1 - backT, backY1, shelfZ0, shelfZ1),
      'y',
      '-',
      'free',
    );

    // A rabbet is the same housing joint as a groove, except the pocket is not
    // left with a shoulder of solid material behind it: it is grown out to the
    // carcass's true rear face, so the back's cavity is open on that edge
    // instead of fully enclosed. See JOINERY.md for why that is worth having.
    const openEdgeAtY = spec.back.style === 'rabbet' ? yBack : undefined;

    for (const femaleId of [leftId, rightId, topId]) {
      joints.push({ maleId: backId, femaleId, purpose: 'back', forceDado: true, openEdgeAtY });
    }
    // The back's bottom edge sits in the floor, whichever panel that is.
    joints.push(
      hasOwnBottom
        ? { maleId: backId, femaleId: bottomId, purpose: 'back', forceDado: true, openEdgeAtY }
        : {
            maleId: backId,
            femaleId: floorId,
            purpose: 'back',
            forceDado: true,
            depthOverride: params.joinery.stackDadoDepth,
            openEdgeAtY,
          },
    );
  }
}

export function findMaterial(params: ProjectParams, id: string): Material {
  const m = params.materials.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown material '${id}'. Check the materials list.`);
  return m;
}

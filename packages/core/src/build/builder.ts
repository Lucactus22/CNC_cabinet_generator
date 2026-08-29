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
  Vec3,
} from '../model/types.js';
import { fitOpening, gapAt, type OpeningFit, type RunSize } from '../model/opening.js';
import { localFrame } from '../model/frame.js';
import {
  drawerHeights,
  hingeHeights,
  layoutBays,
  pinHeights,
  shelfHeights,
  wallMountXs,
} from './layout.js';
import { resolveHardware } from '../hardware/catalogue.js';
import { doorLeafRect, type FrontOpening } from './doors.js';
import { buildFaceFrame } from './faceframe.js';
import { buildDrawerStack } from './drawers.js';

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
  purpose:
    | 'carcass'
    | 'shelf'
    | 'back'
    | 'divider'
    | 'toe-rail'
    | 'hanging-rail'
    | 'face-frame'
    | 'drawer-box'
    | 'drawer-box-back'
    | 'drawer-box-bottom';
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
  /** Blanks that are trapezoids rather than rectangles, resolved by the joinery stage. */
  tapers: TaperRequest[];
  /** Adjustable-shelf pin rows, resolved to concrete holes by the joinery stage. */
  pinRows: PinRowRequest[];
  /** Toe kick cut-outs, resolved against each panel's own frame by the joinery stage. */
  toeNotches: ToeNotchRequest[];
  /** Doors needing hinge boring. */
  hinges: HingeRequest[];
  /** Doors needing handle fixing holes. Empty unless a handle is selected. */
  handles: HandleRequest[];
  /** Screw holes through a hanging rail, for mounting a wall cabinet. */
  wallMounts: WallMountRequest[];
  /** Drawer box bottoms needing a rear-corner notch for the slide's locking device. */
  drawerNotches: DrawerBottomNotchRequest[];
  /** Drawer boxes needing slide boring, box side and cabinet side alike. */
  slides: SlideRequest[];
  notes: string[];
}

/**
 * One vertical edge of a blank cut back at one end, so the part follows a wall
 * that leans instead of leaving a tapering gap down it.
 *
 * Stated in assembly directions rather than in the part's own local axes,
 * because which local edge that turns out to be depends on the panel's
 * handedness — exactly the mistake that hands back a mirrored filler.
 */
export interface TaperRequest {
  partId: string;
  /** Assembly direction the sloping edge faces: the way the wall lies. */
  edgeFacing: Vec3;
  /** Assembly direction of the end where the blank is narrower. */
  narrowEnd: Vec3;
  by: number;
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

/**
 * A door leaf that needs handle boring.
 *
 * Only the hinge side is carried: the handle goes on the opposite edge, and
 * exactly where along it is a placement setting shared by the whole project.
 */
export interface HandleRequest {
  doorId: string;
  hingeSide: 'low' | 'high';
}

/** A door leaf that needs hinge boring, plus the panel its plates screw to. */
export interface HingeRequest {
  doorId: string;
  /** Panel carrying the mounting plates: a carcass side/divider, or a stile. */
  carcassPanelId: string;
  /** Assembly-space heights of each hinge's cup centre. */
  heights: number[];
  /** Which side of the door the hinges are on, in assembly X. */
  side: 'low' | 'high';
  /** Front face of the carcass, which the plate holes are measured from. Unused when mount is 'frame'. */
  yFront: number;
  /**
   * Whether the plates land on the carcass panel behind the opening, or on a
   * face-frame stile in front of it — the two are different shapes (a side
   * panel faces sideways; a stile faces the room like a door) and need
   * different boring math. See `hardware/hinges.ts`.
   */
  mount: 'carcass' | 'frame';
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

/**
 * A notch at each rear corner of a drawer box's bottom, clearing the slide's
 * locking device. Resolved against the panel's own frame by the joinery
 * stage, the same way a toe kick notch is.
 */
export interface DrawerBottomNotchRequest {
  panelId: string;
  /** Along the box's width, from each rear corner. */
  width: number;
  /** Along the box's depth, in from the true rear edge. */
  depth: number;
}

/**
 * A drawer box needing slide boring: mounting holes on its own two sides,
 * and on the two cabinet panels the bay is bounded by.
 */
export interface SlideRequest {
  boxLeftId: string;
  boxRightId: string;
  /** Cabinet panels (carcass side or divider) the runner's cabinet-side member screws to. */
  panelLeftId: string;
  panelRightId: string;
  /**
   * The drawer box's own front face — not the carcass's, which can sit a
   * door-thickness further forward under inset fit — since the runner's
   * mounting holes are measured back from where the box itself starts.
   */
  boxFrontY: number;
  /** The nominal running length actually selected for this drawer. */
  length: number;
  /** How far in from each end of the runner the mounting holes sit. */
  mountInset: number;
  screwDiameter: number;
  /** Assembly-space height the mounting holes are bored at. */
  z: number;
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
  const handles: HandleRequest[] = [];
  const wallMounts: WallMountRequest[] = [];
  const drawerNotches: DrawerBottomNotchRequest[] = [];
  const slides: SlideRequest[] = [];
  const tapers: TaperRequest[] = [];
  const notes: string[] = [];
  const ends: Partial<Record<'left' | 'right', RunEnd>> = {};
  const sink: BuildSink = {
    parts,
    joints,
    pinRows,
    toeNotches,
    hinges,
    handles,
    wallMounts,
    drawerNotches,
    slides,
    notes,
  };

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
        sink,
      );
      z0 += carcass.height;
    });

    // The end cabinets are the ones that meet the room, and only they carry a
    // scribe. Recorded here rather than re-derived afterwards so the numbers
    // come from the very placement the panels were built at.
    const faces = frontFaces(carcasses, yBack, xRun);
    const outer = xRun + Math.max(...carcasses.map((c) => c.width));
    if (ends.left === undefined) ends.left = { cabinetId: cabinet.id, x: xRun, faces };
    ends.right = { cabinetId: cabinet.id, x: outer, faces };

    // The widest box in the stack is what the next cabinet has to clear.
    xRun += Math.max(...carcasses.map((c) => c.width));
  }

  if (params.opening.enabled) {
    const run = runSize(params.cabinets);
    buildScribeParts(params, fitOpening(params.opening, run), run, ends, parts, tapers, notes);
  }

  return {
    parts,
    joints,
    pinRows,
    toeNotches,
    hinges,
    handles,
    wallMounts,
    drawerNotches,
    slides,
    tapers,
    notes,
  };
}

/**
 * One end of the run, where it meets the room.
 *
 * A scribe strip is the one part that is not a property of a single cabinet:
 * it exists because the run as a whole stops here and a wall carries on. It is
 * still built from one cabinet's own placement, so nothing about how that
 * cabinet is machined depends on what else is in the run.
 */
interface RunEnd {
  cabinetId: string;
  /** Assembly X of the run's own outer corner at this end: its footprint. */
  x: number;
  /** One per stretch of the stack that presents a single face, from the floor up. */
  faces: FrontFace[];
}

/**
 * A stretch of the cabinet's side that presents one face to the room.
 *
 * Carcasses step back from each other in depth and can differ in width, so a
 * single strip run up the whole stack would stand proud of the shallower boxes
 * with nothing behind it, and float clear of the narrower ones with nothing to
 * fix it to. One strip per stretch follows the side the way a filler actually
 * does. Boxes that agree on both share a stretch and share a strip: a joint
 * line where the front is continuous is a joint line nobody wants.
 */
interface FrontFace {
  /** The lowest carcass in this stretch, whose id the strip is filed under. */
  carcassId: string;
  /** What that carcass is called, for a label that says which one it stands against. */
  carcassName: string;
  yFront: number;
  /** Assembly X of this stretch's own left and right faces. */
  xLeft: number;
  xRight: number;
  z0: number;
  z1: number;
}

function frontFaces(carcasses: Carcass[], yBack: number, x0: number): FrontFace[] {
  const out: FrontFace[] = [];
  let z = 0;
  carcasses.forEach((carcass, k) => {
    // The toe kick is a recess, so the strip starts above it.
    const bottom = k === 0 && carcass.toeKick.enabled ? carcass.toeKick.height : z;
    const yFront = yBack - carcass.depth;
    const xRight = x0 + carcass.width;
    const last = out[out.length - 1];
    const same =
      last && Math.abs(last.yFront - yFront) < TOL && Math.abs(last.xRight - xRight) < TOL;
    if (same) last.z1 = z + carcass.height;
    else {
      out.push({
        carcassId: carcass.id,
        carcassName: carcass.name,
        yFront,
        xLeft: x0,
        xRight,
        z0: bottom,
        z1: z + carcass.height,
      });
    }
    z += carcass.height;
  });
  return out.filter((f) => f.z1 - f.z0 > TOL);
}

/** The overall size of the run: what has to fit inside a measured opening. */
export function runSize(cabinets: Cabinet[]): RunSize {
  let width = 0;
  let height = 0;
  let depth = 0;
  for (const cabinet of cabinets) {
    const carcasses = resolveWidths(cabinet.carcasses);
    if (carcasses.length === 0) continue;
    width += Math.max(...carcasses.map((c) => c.width));
    height = Math.max(
      height,
      carcasses.reduce((a, c) => a + c.height, 0),
    );
    depth = Math.max(depth, ...carcasses.map((c) => c.depth));
  }
  return { width, height, depth };
}

/**
 * The sacrificial parts that take up the difference between a square run and a
 * crooked room.
 *
 * The carcass stays square — every joint here assumes axis-aligned rectangles,
 * and doors and drawer slides need parallel sides to work at all — so the
 * crookedness is absorbed in one part at each end that meets a wall, scribed to
 * the plaster on site. That is both the correct answer and how the trade solves
 * it. See docs/OPENING.md.
 */
function buildScribeParts(
  params: ProjectParams,
  fit: OpeningFit,
  run: RunSize,
  ends: Partial<Record<'left' | 'right', RunEnd>>,
  parts: Part[],
  tapers: TaperRequest[],
  notes: string[],
): void {
  const opening = params.opening;
  const material = params.materials.find((m) => m.id === opening.scribe.materialId);
  // A missing material is reported by the diagnostics, which is where a missing
  // part belongs; there is nothing sensible to build from it here.
  if (!material) return;
  const t = material.actualThickness;

  for (const endFit of fit.ends) {
    const end = ends[endFit.end];
    if (!end) continue;
    const side = endFit.end === 'left' ? 'L' : 'R';
    const hand = endFit.end === 'left' ? 'Left' : 'Right';

    for (const face of end.faces) {
      // Nothing to take up. A square opening the run already fills, against a
      // wall measured dead flat, needs no sacrificial part at all, and
      // inventing one would be a panel and a fixing for a gap that is not there.
      // The wall is measured against the run as a whole, so a stretch that is
      // set back or narrower than the widest box has that much further to
      // reach. Measuring from the run's outer corner instead leaves the strip
      // hanging in the air beside a narrower box, fixed to nothing.
      const depthFromBack = run.depth - face.yFront;
      const gapOf = (z: number): number =>
        Math.max(0, gapAt(endFit, run, z, depthFromBack) + shortfall(end, endFit.end, face));
      const gapLow = gapOf(face.z0);
      const gapHigh = gapOf(face.z1);
      if (gapLow <= TOL && gapHigh <= TOL && opening.wallBow <= TOL) continue;

      // Cut to the gap plus the scribe allowance, so a uniform strip of
      // material is left to plane off all the way up rather than 20 mm at one
      // end and nothing at the other.
      const atTop = gapHigh + opening.scribe.width;
      const atBottom = gapLow + opening.scribe.width;
      const widest = Math.max(atTop, atBottom);
      if (widest <= TOL) continue;

      // A strip that is only the scribe allowance, plus the standoff that keeps
      // the carcass clear of a bulge in the wall, is a scribe; anything covering
      // a real gap as well is a filler panel, and a woodworker calls it that.
      const filling = widest > opening.scribe.width + opening.wallBow + 1;
      const what = filling ? 'filler panel' : 'scribe strip';
      const outward: Vec3 = endFit.end === 'left' ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
      const x0 = endFit.end === 'left' ? face.xLeft - widest : face.xRight;

      // Named for the carcass it stands against, but only where the stack steps
      // back and there is more than one: a single-carcass cabinet has nothing to
      // distinguish and reads better without it.
      const against = end.faces.length > 1 ? `, ${face.carcassName.toLowerCase()}` : '';
      const id = `${end.cabinetId}-${face.carcassId}-SCRIBE-${side}`;
      const b = box(x0, x0 + widest, face.yFront - t, face.yFront, face.z0, face.z1);
      parts.push({
        id,
        label: `${hand}-hand ${what}${against}`,
        role: 'scribe',
        cabinetId: end.cabinetId,
        carcassId: face.carcassId,
        materialId: material.id,
        thickness: t,
        box: b,
        // Face A is the back, as it is on a door, so a surface effect asked for
        // on the outside lands on the face that shows next to the doors.
        normalAxis: 'y',
        faceASign: '+',
        frame: localFrame(b, 'y', '+'),
        width: 0,
        height: 0,
        exposed: { x: 0, y: 0, w: 0, h: 0 },
        outline: rect(0, 0, 0, 0),
        features: [],
        // Upright, alongside the door it stands next to.
        grainAxis: 'v',
      });

      if (atTop < widest - TOL) {
        tapers.push({ partId: id, edgeFacing: outward, narrowEnd: UP, by: widest - atTop });
      } else if (atBottom < widest - TOL) {
        tapers.push({ partId: id, edgeFacing: outward, narrowEnd: DOWN, by: widest - atBottom });
      }

      notes.push(
        `${hand}-hand ${what}${against}: ${atBottom.toFixed(0)} mm wide at the bottom and ${atTop.toFixed(0)} mm at the top, with ${opening.scribe.width} mm to plane back to the wall. No fixings are machined for it, because where it finally lands is decided against the plaster.`,
      );
    }
  }
}

/**
 * How much further than the run's own corner a stretch has to reach.
 *
 * The opening is fitted around the run's footprint, which is the widest box in
 * each stack. A narrower box higher up stops short of that, and the strip
 * beside it has to make up the difference or it hangs in the air with nothing
 * to fix it to.
 */
function shortfall(end: RunEnd, side: 'left' | 'right', face: FrontFace): number {
  return side === 'left' ? face.xLeft - end.x : end.x - face.xRight;
}

const TOL = 1e-6;
const UP: Vec3 = { x: 0, y: 0, z: 1 };
const DOWN: Vec3 = { x: 0, y: 0, z: -1 };

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

/**
 * Everything a carcass adds to as it is built.
 *
 * Gathered into one object rather than passed as a row of same-typed arrays:
 * eight positional arrays is an argument order waiting to be got wrong, and
 * swapping two of them would put pin rows where the toe notches should be with
 * nothing to say so until a panel came off the machine.
 */
export interface BuildSink {
  parts: Part[];
  joints: JointRequest[];
  pinRows: PinRowRequest[];
  toeNotches: ToeNotchRequest[];
  hinges: HingeRequest[];
  handles: HandleRequest[];
  wallMounts: WallMountRequest[];
  drawerNotches: DrawerBottomNotchRequest[];
  slides: SlideRequest[];
  notes: string[];
}

function buildCarcass(
  ctx: CarcassContext,
  params: ProjectParams,
  carcassMat: Material,
  shelfMat: Material,
  t: number,
  sink: BuildSink,
): void {
  const { parts, joints, pinRows, toeNotches, hinges, handles, wallMounts, notes } = sink;
  // Which hardware this project is cut to. Resolving it here rather than
  // reading numbers off the project is the whole point of the catalogue: a
  // different make of hinge is a different entry, not a different code path.
  const hw = resolveHardware(params.hardware);
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
  // Vertically the door run — and, when there is one, the face frame — stops
  // under the top panel, which on a capped carcass is the visible ledge, and
  // above the toe kick.
  const runTop = zTop - t;
  const runBottom = z0 + toeH;
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
      const heights = pinHeights(shelfZ0, shelfZ1, {
        ...pin,
        pitch: hw.shelfPin.boring.pitch,
      });
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

  // --- Face frame ----------------------------------------------------------
  // Stands proud of the carcass front and, once built, is what the doors and
  // hinges below reference instead of the carcass opening — see
  // build/doors.ts for why the door layout itself never has to know which one
  // it was handed.
  let faceFrame: ReturnType<typeof buildFaceFrame> | null = null;
  if (spec.construction === 'face-frame') {
    const stock = params.stockMaterials.find((m) => m.id === spec.faceFrame.materialId);
    if (!stock) {
      notes.push(
        `${human}: the face frame's material is missing from the stock list, so no frame was built and its doors were left referencing the carcass opening instead.`,
      );
    } else {
      faceFrame = buildFaceFrame(
        {
          cabinetId: ctx.cabinetId,
          carcassId: spec.id,
          prefix,
          human,
          xL,
          xR,
          yFront,
          zBottom: runBottom,
          zTop: runTop,
        },
        spec.faceFrame,
        stock,
        bays,
        dividerX.map((x) => x + t / 2),
        sink,
      );
    }
  }

  // --- Doors and drawers ---------------------------------------------------
  // Both consume the same opening abstraction R-07 introduced: a clear
  // rectangle plus how far each edge may be overlaid, whichever construction
  // built it. A bay is one or the other, never both — see
  // `BaySpec.drawerFrontHeights` for why a drawer stack over a door is out of
  // scope for now.
  const openings: FrontOpening[] = faceFrame
    ? faceFrame.openings
    : bays.map((bay, i) => ({
        clearX0: bay.x0,
        clearX1: bay.x1,
        clearZ0: shelfZ0,
        clearZ1: shelfZ1,
        // Each overlay door covers half of the panel it shares with its
        // neighbour, and all of an outer side, so the run reads as one
        // continuous front. Vertically there is nothing to overlay onto —
        // the run simply stops at the ledge and the toe kick.
        overlayX0: i === 0 ? xL : dividerX[i - 1]! + t / 2,
        overlayX1: i === bays.length - 1 ? xR : dividerX[i]! + t / 2,
        overlayZ0: runBottom,
        overlayZ1: runTop,
      }));
  const hasDrawers = (i: number): boolean => (spec.bays[i]?.drawerFrontHeights?.length ?? 0) > 0;

  // --- Doors -------------------------------------------------------------
  const doorMat = params.materials.find((m) => m.id === params.doors.materialId);
  const anyDoors = bays.some(
    (_, i) => !hasDrawers(i) && (spec.bays[i]?.doors ?? 'none') !== 'none',
  );
  if (anyDoors && !doorMat) {
    notes.push('Doors are switched on but their material is missing from the list.');
  }
  if (anyDoors && doorMat) {
    const d = params.doors;
    const td = doorMat.actualThickness;
    // A door hangs off whatever it fronts: the carcass directly, or a face
    // frame standing proud of it. Referencing the frame's own front face here
    // is what stops an overlay door being positioned back inside the frame's
    // own thickness.
    const frontY = faceFrame?.frontY ?? yFront;
    const yDoor0 = d.fit === 'overlay' ? frontY - td : frontY;

    bays.forEach((bay, i) => {
      if (hasDrawers(i)) return;
      const style = spec.bays[i]?.doors ?? 'none';
      if (style === 'none') return;

      const {
        x0,
        x1,
        z0: zBottom,
        z1: zTopDoor,
      } = doorLeafRect(openings[i]!, d.fit, d.reveal, d.insetGap);
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

        const heights = hingeHeights(zBottom, zTopDoor, hw.hinge.boring.endOffset);
        const side = leaf.hingeSide === 'low' ? 'left' : 'right';
        // Plates screw to whichever member the hinge side runs against: a
        // face-frame stile when there is a frame, the carcass side or
        // divider it stands in for otherwise.
        const carcassPanelId = faceFrame
          ? faceFrame.stileFor(i, side)
          : leaf.hingeSide === 'low'
            ? i === 0
              ? leftId
              : dividerIds[i - 1]!
            : i === bays.length - 1
              ? rightId
              : dividerIds[i]!;
        hinges.push({
          doorId: id,
          carcassPanelId,
          heights,
          side: leaf.hingeSide,
          yFront,
          mount: faceFrame ? 'frame' : 'carcass',
        });
        // The handle goes on the edge away from the hinges, so the request
        // carries the hinge side rather than a position: where on that edge it
        // lands is a placement setting, not something the carcass decides.
        if (hw.handle) handles.push({ doorId: id, hingeSide: leaf.hingeSide });
      });
    });
  }

  // --- Drawers ---------------------------------------------------------------
  const anyDrawers = bays.some((_, i) => hasDrawers(i));
  if (anyDrawers && !doorMat) {
    notes.push('Drawers are configured but their face material is missing from the list.');
  }
  const drawerBoxMat = params.materials.find((m) => m.id === params.drawerBoxMaterialId);
  if (anyDrawers && doorMat && !drawerBoxMat) {
    notes.push('Drawers are configured but the drawer box material is missing from the list.');
  }
  if (anyDrawers && doorMat && drawerBoxMat) {
    const d = params.doors;
    bays.forEach((bay, i) => {
      const explicit = spec.bays[i]?.drawerFrontHeights ?? [];
      if (explicit.length === 0) return;
      const opening = openings[i]!;
      const available =
        d.fit === 'overlay'
          ? opening.overlayZ1 - opening.overlayZ0
          : opening.clearZ1 - opening.clearZ0;
      const { heights, fellBackToEven } = drawerHeights(available, explicit, d.reveal);
      if (fellBackToEven) {
        notes.push(
          `${human} carcass, bay ${i + 1}: the drawer front heights did not add up to the opening, so the stack was split evenly instead.`,
        );
      }
      const { leftPanel, rightPanel } = bayBoundingPanels(
        i,
        bays.length,
        leftId,
        rightId,
        dividerIds,
      );
      buildDrawerStack(
        {
          cabinetId: ctx.cabinetId,
          carcassId: spec.id,
          prefix,
          human,
          bayIndex: i,
          // A drawer face hangs off whatever it fronts, the same as a door does.
          yFront: faceFrame?.frontY ?? yFront,
          innerBackY,
          panelLeftId: leftPanel,
          panelRightId: rightPanel,
        },
        opening,
        heights,
        d.fit,
        d.reveal,
        d.insetGap,
        drawerBoxMat,
        drawerBoxMat.actualThickness,
        doorMat,
        hw.slide,
        sink,
      );
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

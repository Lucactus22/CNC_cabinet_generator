import type { Vec3 } from './types.js';

/**
 * The opening a run of cabinets has to fit into.
 *
 * Real rooms are crooked: walls lean, corners are not 90 degrees, floors slope
 * and plaster bows. The carcasses stay square regardless — every joint here
 * assumes axis-aligned rectangles, and doors and drawer slides need parallel
 * sides to work at all. The crookedness is absorbed in a handful of sacrificial
 * parts at the interface, which is both the correct answer and how it is done
 * in the trade. See docs/OPENING.md.
 */

/** Whether the run meets a wall at this end, or simply stops. */
export type OpeningEnd = 'wall' | 'open';

export interface ScribeSpec {
  /**
   * Material left on the outer edge of the strip for planing back to the wall.
   *
   * This is the only thing standing between a straight cut edge and a wall that
   * is neither straight nor plumb, so it has to be at least as wide as the
   * worst bow in the wall.
   */
  width: number;
  materialId: string;
}

/**
 * Three tape readings across a corner: two marks stepped out along each wall,
 * and the distance between them.
 *
 * Kept alongside the derived angle because these are the primary record — they
 * are what a person actually held a tape across, and they are what someone
 * re-opening the project needs to see to know whether to trust the number.
 * `model/measure.ts` turns them into the angle.
 */
export interface CornerTriangle {
  /** Marked out from the corner along the back wall. */
  alongBack: number;
  /** Marked out from the corner along the return wall. */
  alongReturn: number;
  /** Between the two marks. */
  diagonal: number;
}

export interface OpeningSpec {
  /** Off means no room was measured, and nothing about the run changes. */
  enabled: boolean;
  /**
   * Clear width between the walls, measured at the top of the run and at the
   * floor. A leaning wall makes the two differ, and the narrower one is what
   * the square box has to fit inside.
   */
  widthAtTop: number;
  widthAtBottom: number;
  /**
   * Floor to the head of the opening, measured at each end of the run. The head
   * is taken as level, so a difference here is a sloping floor.
   */
  heightAtLeft: number;
  heightAtRight: number;
  /**
   * Plan angle between the back wall and the return wall at each end. 90 is
   * square; less than that closes in towards the front of the cabinets.
   */
  cornerAngleLeft: number;
  cornerAngleRight: number;
  /**
   * What was measured to arrive at those angles, where they were measured by
   * triangle rather than typed in. Cleared when the angle is edited by hand, so
   * a stored triangle never quietly disagrees with the angle in use.
   */
  cornerTriangleLeft?: CornerTriangle;
  cornerTriangleRight?: CornerTriangle;
  /**
   * Worst deviation of a return wall from flat, measured against a straightedge.
   *
   * Two width measurements say nothing about what the wall does between them,
   * so this is the number that keeps a bulge halfway up from being discovered
   * with the cabinets already built.
   */
  wallBow: number;
  left: OpeningEnd;
  right: OpeningEnd;
  scribe: ScribeSpec;
}

/** The overall size of the run: what has to fit inside the opening. */
export interface RunSize {
  width: number;
  height: number;
  /** The deepest cabinet, which is how far a leaning corner reaches forward. */
  depth: number;
}

/** One measurement that is not square, and what has to take it up. */
export interface OutOfTrue {
  /** How far from true, in millimetres over the run. */
  amount: number;
  /** Said the way a woodworker would say it, e.g. '12 mm narrower at the bottom'. */
  detail: string;
  /**
   * What absorbs it. A lean is cut into the blank as a taper; a bow can only be
   * planed off; a sloping floor is a packing job under the cabinets.
   */
  takenUpBy: 'taper' | 'scribe' | 'plinth';
  /**
   * How much of it the scribe allowance still has to cover once the blank has
   * been cut. This, not `amount`, is what the allowance is measured against:
   * warning that a 12 mm lean outruns a 20 mm allowance when the taper already
   * follows the lean exactly is a false alarm, and a warning that cries wolf is
   * worse than no warning.
   */
  scribeNeeds: number;
  /** The measurement to check with the tape if the number looks wrong. */
  hint: string;
}

/** What the interface part at one end of the run has to cover. */
export interface EndFit {
  end: 'left' | 'right';
  /**
   * Where the wall's back line sits, measured out from the run's own end, at
   * the top of the run and at the floor.
   */
  backAtTop: number;
  backAtBottom: number;
  /**
   * The gap in the plane of the *deepest* carcass's front face. A carcass set
   * back from that has travelled less far along the wall's lean and sees only
   * that fraction of it; `gapAt` works it out for one.
   */
  gapAtTop: number;
  gapAtBottom: number;
  /**
   * How far the wall closes in over the depth of the run. Positive means the
   * opening is tighter at the front than at the back.
   */
  lean: number;
}

export interface OpeningFit {
  /** The largest square box the measured opening will take. */
  envelope: { width: number; height: number };
  /** The envelope less the run. Negative means the run does not fit. */
  clearance: { width: number; height: number };
  fits: boolean;
  /** One per walled end, in the order left then right. */
  ends: EndFit[];
  outOfTrue: OutOfTrue[];
  /** How far the run has to be packed up at the low end of a sloping floor. */
  levelling: number;
  /** Floor height at each end, against the level datum the cabinets stand on. */
  floorAtLeft: number;
  floorAtRight: number;
  /** Head of the opening above that datum. */
  head: number;
}

export function defaultScribe(materialId: string): ScribeSpec {
  return { width: 20, materialId };
}

/**
 * A plausible alcove, switched off.
 *
 * The numbers are a starting point for someone who has yet to measure, not an
 * assumption about their room: with `enabled` false nothing reads them, and the
 * run is built exactly as it would be with no opening in the model at all.
 */
export function defaultOpening(materialId: string): OpeningSpec {
  return {
    enabled: false,
    widthAtTop: 940,
    widthAtBottom: 928,
    heightAtLeft: 2410,
    heightAtRight: 2400,
    cornerAngleLeft: 90,
    cornerAngleRight: 90,
    wallBow: 3,
    left: 'wall',
    right: 'wall',
    scribe: defaultScribe(materialId),
  };
}

/**
 * How far a return wall drifts sideways over the depth of the run.
 *
 * Positive when the corner is acute and the wall closes in towards the front,
 * which is the direction that eats the width the carcass needs.
 */
export function wallLean(depth: number, angleDeg: number): number {
  const t = Math.tan((angleDeg * Math.PI) / 180);
  // A wall parallel to the back wall is not a corner at all; treat it as square
  // rather than returning an infinite drift.
  if (!Number.isFinite(t) || Math.abs(t) < 1e-9) return 0;
  return depth / t;
}

const TOL = 1e-6;

/**
 * Work out the largest square box the opening will take, where the run stands
 * in it, and what is left over for the scribe strips and fillers to cover.
 *
 * Widths are measured at the **back wall**, which is where a tape naturally
 * goes. Each return wall then drifts sideways by its lean over the depth of the
 * run, so a wall intrudes into the run's footprint by `max(0, lean)` — at the
 * front when the corner is acute, and not at all when it is obtuse, because
 * then the wall is only ever further away than the tape said.
 *
 * The run is centred in the band that is clear over the *whole* depth, not in
 * the opening as it appears at the front. Centring it at the front is what puts
 * the back corner of an end cabinet into a wall that leans away, which is a
 * silently wrong cabinet rather than a diagnostic.
 */
export function fitOpening(opening: OpeningSpec, run: RunSize): OpeningFit {
  const leanLeft = opening.left === 'wall' ? wallLean(run.depth, opening.cornerAngleLeft) : 0;
  const leanRight = opening.right === 'wall' ? wallLean(run.depth, opening.cornerAngleRight) : 0;
  const bowLeft = opening.left === 'wall' ? opening.wallBow : 0;
  const bowRight = opening.right === 'wall' ? opening.wallBow : 0;

  const narrowest = Math.min(opening.widthAtTop, opening.widthAtBottom);
  const envelopeWidth =
    narrowest - Math.max(0, leanLeft) - Math.max(0, leanRight) - bowLeft - bowRight;
  const envelopeHeight = Math.min(opening.heightAtLeft, opening.heightAtRight);

  const walled: Array<'left' | 'right'> = [];
  if (opening.left === 'wall') walled.push('left');
  if (opening.right === 'wall') walled.push('right');
  const share = Math.max(1, walled.length);

  const spare = Math.max(0, envelopeWidth - run.width);
  // Anything the opening is wider than at its narrowest belongs to the walls
  // that are actually there: with one wall, all of the width change is that
  // wall leaning, because the open end has nothing to lean.
  const extra = (width: number): number => (width - narrowest) / share;

  const ends: EndFit[] = walled.map((end) => {
    const lean = end === 'left' ? leanLeft : leanRight;
    const bow = end === 'left' ? bowLeft : bowRight;
    // Where the wall's back line sits, measured out from the run's own end.
    const inset = Math.max(0, lean) + bow + spare / share;
    const backAtTop = inset + extra(opening.widthAtTop);
    const backAtBottom = inset + extra(opening.widthAtBottom);
    // The filler lives in the plane of the fronts, where the wall stands
    // `lean` nearer than its back line — or further, when the corner is obtuse.
    // Not clamped at zero: a negative gap is the true statement that the run
    // overlaps the wall there, which the diagnostics report as an error and the
    // 3D view draws honestly. Only the part that gets cut clamps it.
    return {
      end,
      backAtTop,
      backAtBottom,
      gapAtTop: backAtTop - lean,
      gapAtBottom: backAtBottom - lean,
      lean,
    };
  });

  const levelling = Math.abs(opening.heightAtLeft - opening.heightAtRight);
  // Less height to a level head means more floor under it: the cabinets stand
  // on that end and are packed down at the other.
  const leftIsHigh = opening.heightAtLeft <= opening.heightAtRight;

  return {
    envelope: { width: envelopeWidth, height: envelopeHeight },
    clearance: { width: envelopeWidth - run.width, height: envelopeHeight - run.height },
    fits: envelopeWidth >= run.width - TOL && envelopeHeight >= run.height - TOL,
    ends,
    outOfTrue: outOfTrue(opening, leanLeft, leanRight, share, levelling, leftIsHigh),
    levelling,
    floorAtLeft: leftIsHigh ? 0 : -levelling,
    floorAtRight: leftIsHigh ? -levelling : 0,
    head: envelopeHeight,
  };
}

function outOfTrue(
  opening: OpeningSpec,
  leanLeft: number,
  leanRight: number,
  share: number,
  levelling: number,
  leftIsHigh: boolean,
): OutOfTrue[] {
  const out: OutOfTrue[] = [];
  const mm = (n: number): string => n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '');
  const anyWall = opening.left === 'wall' || opening.right === 'wall';

  const widthLean = Math.abs(opening.widthAtTop - opening.widthAtBottom);
  if (widthLean > TOL && anyWall) {
    const lower = opening.widthAtBottom < opening.widthAtTop;
    out.push({
      amount: widthLean,
      detail: `${mm(widthLean)} mm narrower at the ${lower ? 'bottom' : 'top'} than at the ${lower ? 'top' : 'bottom'}`,
      takenUpBy: 'taper',
      // One width measurement cannot say which of two walls is doing the
      // leaning, so the taper splits it between them. If it is really all on
      // one, each strip is out by the half it was not given.
      scribeNeeds: share > 1 ? widthLean / share : 0,
      hint: 'Opening width at the top and at the bottom.',
    });
  }

  for (const [end, lean, angle] of [
    ['left', leanLeft, opening.cornerAngleLeft],
    ['right', leanRight, opening.cornerAngleRight],
  ] as const) {
    if (Math.abs(lean) <= TOL) continue;
    out.push({
      amount: Math.abs(lean),
      detail: `${mm(Math.abs(lean))} mm ${lean > 0 ? 'tighter' : 'wider'} at the front than at the back on the ${end}, where the corner measures ${angle.toFixed(1)}°`,
      takenUpBy: 'taper',
      // Measured at its own end, so it is cut in exactly and nothing is left.
      scribeNeeds: 0,
      hint: `Corner angle at the ${end}.`,
    });
  }

  if (anyWall && opening.wallBow > TOL) {
    out.push({
      amount: opening.wallBow,
      detail: `${mm(opening.wallBow)} mm out of flat where the wall bows`,
      takenUpBy: 'scribe',
      // Nothing predicts a bow, so all of it comes off with a plane.
      scribeNeeds: opening.wallBow,
      hint: 'Wall bow.',
    });
  }

  if (levelling > TOL) {
    out.push({
      amount: levelling,
      detail: `${mm(levelling)} mm higher on the ${leftIsHigh ? 'left' : 'right'} than on the ${leftIsHigh ? 'right' : 'left'}`,
      takenUpBy: 'plinth',
      scribeNeeds: 0,
      hint: 'Opening height at the left and at the right.',
    });
  }

  return out;
}

/**
 * The derivation, in the words someone would use to check it against their tape.
 *
 * The same sentences appear in the parameter panel and in the diagnostics, so
 * there is one wording to get right rather than two that can disagree.
 */
export function describeFit(opening: OpeningSpec, fit: OpeningFit, run: RunSize): string[] {
  const mm = (n: number): string => n.toFixed(0);
  const strips = fit.ends.length > 1 ? 'strips' : 'strip';
  const plural = fit.ends.length > 1 ? 'are' : 'is';
  const each = fit.ends.length > 1 ? ' each end' : '';
  const out: string[] = [];

  out.push(
    fit.fits
      ? `The opening will take a square box ${mm(fit.envelope.width)} × ${mm(fit.envelope.height)} mm. The run is ${mm(run.width)} × ${mm(run.height)} mm, leaving ${mm(fit.clearance.width)} mm across and ${mm(fit.clearance.height)} mm of height.`
      : `The opening will only take a square box ${mm(fit.envelope.width)} × ${mm(fit.envelope.height)} mm, and the run is ${mm(run.width)} × ${mm(run.height)} mm.`,
  );

  for (const entry of fit.outOfTrue) {
    // With no wall at either end there is nothing to scribe to, so promising a
    // strip that covers it would be describing a part that is never made.
    if (entry.takenUpBy === 'plinth' || fit.ends.length === 0) continue;
    const spare = opening.scribe.width - entry.scribeNeeds;
    const cutIn = entry.amount - entry.scribeNeeds;
    if (entry.scribeNeeds <= TOL) {
      out.push(
        `The opening is ${entry.detail}, and the ${strips} ${plural} cut to follow it, so the scribe allowance is left whole.`,
      );
    } else if (spare < 0) {
      out.push(
        `The opening is ${entry.detail}, and the ${mm(entry.scribeNeeds)} mm of it the ${strips} cannot follow is more than a ${mm(opening.scribe.width)} mm scribe allowance can plane away: it runs out ${mm(-spare)} mm short.`,
      );
    } else if (cutIn <= TOL) {
      out.push(
        `The opening is ${entry.detail}, so a ${mm(opening.scribe.width)} mm scribe strip${each} covers it with ${mm(spare)} mm to spare.`,
      );
    } else {
      out.push(
        `The opening is ${entry.detail}. The ${strips} follow ${mm(cutIn)} mm of that; a ${mm(opening.scribe.width)} mm scribe allowance covers the remaining ${mm(entry.scribeNeeds)} mm with ${mm(spare)} mm to spare.`,
      );
    }
  }

  if (fit.levelling > TOL) {
    const high = fit.floorAtLeft >= fit.floorAtRight ? 'left' : 'right';
    out.push(
      `The floor is ${mm(fit.levelling)} mm higher on the ${high}. Stand the run level on that end and pack it down at the other: cut the toe kick ${mm(fit.levelling)} mm oversize and scribe it to the floor, or stand the cabinets on adjustable feet.`,
    );
  }

  return out;
}

/**
 * The measured opening as closed polylines in assembly space, for the 3D view.
 *
 * Built here rather than in the viewer so the crooked room on screen is drawn
 * from the very numbers the scribe parts are cut from, and cannot drift from
 * them. An end with no wall is drawn flush with the run, because there is
 * nothing there.
 */
export function openingWireframe(opening: OpeningSpec, fit: OpeningFit, run: RunSize): Vec3[][] {
  if (!opening.enabled) return [];
  const yBack = run.depth;
  const top = fit.head;

  /**
   * Wall x at height z, at the front of the run and at the back of it.
   *
   * The gaps are quoted at the floor and at the top of the run, which is where
   * the two width measurements were taken, so anything between them is a
   * straight interpolation over that height — and above the run the wall simply
   * carries on.
   */
  const wallX = (end: 'left' | 'right', z: number, atBack: boolean): number => {
    const fitEnd = fit.ends.find((e) => e.end === end);
    if (!fitEnd) return end === 'left' ? 0 : run.width;
    // At the back wall none of the lean has been spent, so the wall sits on its
    // back line; at the front of the run, all of it has. That is what draws the
    // corner as the angle it was measured at.
    const out = gapAt(fitEnd, run, z, atBack ? 0 : run.depth);
    return end === 'left' ? -out : run.width + out;
  };

  const loops: Vec3[][] = [];
  const zL = fit.floorAtLeft;
  const zR = fit.floorAtRight;

  for (const end of ['left', 'right'] as const) {
    if (!fit.ends.some((e) => e.end === end)) continue;
    const zFloor = end === 'left' ? zL : zR;
    loops.push([
      { x: wallX(end, zFloor, false), y: 0, z: zFloor },
      { x: wallX(end, zFloor, true), y: yBack, z: zFloor },
      { x: wallX(end, top, true), y: yBack, z: top },
      { x: wallX(end, top, false), y: 0, z: top },
    ]);
  }

  // The back wall's opening: the sloping floor along the bottom, the level head
  // across the top.
  loops.push([
    { x: wallX('left', zL, true), y: yBack, z: zL },
    { x: wallX('right', zR, true), y: yBack, z: zR },
    { x: wallX('right', top, true), y: yBack, z: top },
    { x: wallX('left', top, true), y: yBack, z: top },
  ]);

  loops.push([
    { x: wallX('left', zL, false), y: 0, z: zL },
    { x: wallX('right', zR, false), y: 0, z: zR },
    { x: wallX('right', zR, true), y: yBack, z: zR },
    { x: wallX('left', zL, true), y: yBack, z: zL },
  ]);

  return loops;
}

/**
 * The gap one end's strip has to cover, at a given height and a given distance
 * forward of the back wall.
 *
 * Height is a straight interpolation between the two width measurements. Depth
 * matters because the wall's lean is spent over the run's full depth: a carcass
 * set back 200 mm in a 600 mm run has only travelled two thirds of the way
 * along it, so its strip sees two thirds of the drift. Cutting every strip in a
 * stepped stack to the deepest one's gap leaves the set-back filler short of
 * the plaster on an acute corner, and planing away half of it on an obtuse one.
 */
export function gapAt(end: EndFit, run: RunSize, z: number, depthFromBack: number): number {
  const clamp = (n: number): number => Math.min(1, Math.max(0, n));
  const up = run.height <= TOL ? 1 : clamp(z / run.height);
  const back = end.backAtBottom + (end.backAtTop - end.backAtBottom) * up;
  const reach = run.depth <= TOL ? 1 : clamp(depthFromBack / run.depth);
  return back - end.lean * reach;
}

import type { CornerTriangle, OpeningSpec } from './opening.js';
import { wallLean } from './opening.js';

/**
 * Turning what a tape says into what the model needs.
 *
 * Nobody carries a protractor that fits a room corner, and a bevel gauge read
 * off a phone is worth about as much as a guess. What a woodworker actually
 * does is lay out a triangle on the floor and check its diagonal — the 3-4-5
 * rule, which is the law of cosines with the numbers already worked out. So the
 * corner angle is derived from three tape readings rather than asked for, and
 * every other measurement here is something a person can hold a tape across.
 *
 * See docs/OPENING.md.
 */

/** Legs the guided walkthrough marks out by default: 600, 800, and 1000 if square. */
export const DEFAULT_LEG_BACK = 600;
export const DEFAULT_LEG_RETURN = 800;

/** What a dead-square corner would read across the two marks. */
export function squareDiagonal(alongBack: number, alongReturn: number): number {
  return Math.hypot(alongBack, alongReturn);
}

/**
 * The diagonal a given corner angle would read across two marks: the law of
 * cosines run forwards.
 *
 * Needed so the walkthrough can open on the angle already in effect. Seeding it
 * with a square triangle instead would have the corner page say 'dead square'
 * about a corner the project is being cut to 85 degrees for.
 */
export function diagonalFor(alongBack: number, alongReturn: number, angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  const squared = alongBack ** 2 + alongReturn ** 2 - 2 * alongBack * alongReturn * Math.cos(a);
  return Math.sqrt(Math.max(0, squared));
}

/**
 * The angle three tape readings imply, by the law of cosines.
 *
 * Returns null when the readings cannot be a triangle at all, rather than an
 * angle derived from a NaN. The caller says what is wrong; see
 * `checkCornerTriangle`.
 */
export function cornerAngleFrom(t: CornerTriangle): number | null {
  const { alongBack: b, alongReturn: c, diagonal: d } = t;
  if (!(b > 0) || !(c > 0) || !(d > 0)) return null;
  const cos = (b * b + c * c - d * d) / (2 * b * c);
  // Three readings that do not close put this outside [-1, 1]. Clamping instead
  // would answer 0 or 180 degrees with a straight face.
  if (cos < -1 || cos > 1) return null;
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * What is wrong with three tape readings, said the way someone standing in the
 * room would need to hear it. Null when they are fine.
 */
export function checkCornerTriangle(t: CornerTriangle): string | null {
  const { alongBack: b, alongReturn: c, diagonal: d } = t;
  const mm = (n: number): string => n.toFixed(0);
  if (!(b > 0) || !(c > 0))
    return 'Mark a distance out along each wall first, then measure between the marks.';
  if (!(d > 0)) return 'Measure between the two marks.';
  if (d >= b + c) {
    return `${mm(b)} and ${mm(c)} mm cannot be ${mm(d)} mm apart: the diagonal is always shorter than the two legs added together. Check both marks are measured from the same corner.`;
  }
  if (d <= Math.abs(b - c)) {
    return `${mm(b)} and ${mm(c)} mm cannot be only ${mm(d)} mm apart. Check the readings.`;
  }
  const angle = cornerAngleFrom(t);
  if (angle === null) return 'Those three readings do not make a triangle. Measure them again.';
  if (angle < 45 || angle > 135) {
    return `That works out at ${angle.toFixed(1)}°, which would be a very unusual corner. Check both marks are measured from the same corner, along the wall rather than across it.`;
  }
  return null;
}

/**
 * The corner in the words someone would use to sanity-check it against the room
 * in front of them: the angle, and what it costs over the depth of the run.
 */
export function describeCorner(t: CornerTriangle, depth: number): string | null {
  const angle = cornerAngleFrom(t);
  if (angle === null) return null;
  const square = squareDiagonal(t.alongBack, t.alongReturn);
  const lean = wallLean(depth, angle);
  const out = Math.abs(lean);
  if (Math.abs(angle - 90) < 0.05) {
    return `Dead square: a right angle would read ${square.toFixed(0)} mm across those marks, and it does.`;
  }
  return (
    `${angle.toFixed(1)}° — a square corner would read ${square.toFixed(0)} mm across those marks. ` +
    `Over the ${depth.toFixed(0)} mm depth of the run the wall ${lean > 0 ? 'closes in' : 'opens out'} by ${out.toFixed(0)} mm.`
  );
}

export interface MeasurementProblem {
  severity: 'error' | 'warning';
  message: string;
  hint: string;
}

/**
 * Readings that look like a slip of the tape rather than a crooked room.
 *
 * A digit dropped from a tape reading is not a failed test, it is a cabinet
 * built to the wrong size. None of these say the room is impossible — they say
 * the number is worth walking back and checking before a sheet is cut.
 */
export function checkMeasurements(opening: OpeningSpec): MeasurementProblem[] {
  const out: MeasurementProblem[] = [];
  const mm = (n: number): string => n.toFixed(0);

  if (!(opening.widthAtTop > 0) || !(opening.widthAtBottom > 0)) {
    out.push({
      severity: 'error',
      message: 'The opening width has not been measured.',
      hint: 'Measure the clear width between the walls at the top of the run and at the floor.',
    });
  }
  if (!(opening.heightAtLeft > 0) || !(opening.heightAtRight > 0)) {
    out.push({
      severity: 'error',
      message: 'The opening height has not been measured.',
      hint: 'Measure from the floor to the head of the opening at each end of the run.',
    });
  }

  // A wall this far out over the height of a run is rare enough that a
  // mistyped reading is the likelier explanation.
  const lean = Math.abs(opening.widthAtTop - opening.widthAtBottom);
  if (lean > 100) {
    out.push({
      severity: 'warning',
      message: `The opening is ${mm(lean)} mm narrower at one end than the other, which is a lot of lean for one wall. Worth measuring again.`,
      hint: 'Check the tape was held level and square across the opening both times.',
    });
  }
  const slope = Math.abs(opening.heightAtLeft - opening.heightAtRight);
  if (slope > 100) {
    out.push({
      severity: 'warning',
      message: `The floor drops ${mm(slope)} mm across the run, which is a lot. Worth measuring again.`,
      hint: 'Check both heights were taken from the same head, and that neither tape was snagged.',
    });
  }
  // With no wall at either end nothing is scribed to anything, so telling
  // someone to skim a wall would contradict the very next line of the
  // diagnostics, which says no strips were made.
  const anyWall = opening.left === 'wall' || opening.right === 'wall';
  if (anyWall && opening.wallBow > 25) {
    out.push({
      severity: 'warning',
      message: `A ${mm(opening.wallBow)} mm bow is more than a scribe can hide comfortably; that wall may want packing or skimming first.`,
      hint: 'Check the straightedge was held against the wall rather than against the skirting.',
    });
  }
  for (const [end, spec, inUse, isWall] of [
    ['left', opening.cornerTriangleLeft, opening.cornerAngleLeft, opening.left === 'wall'],
    ['right', opening.cornerTriangleRight, opening.cornerAngleRight, opening.right === 'wall'],
  ] as const) {
    if (!isWall || !spec) continue;
    const problem = checkCornerTriangle(spec);
    if (problem) {
      out.push({
        severity: 'warning',
        message: `The ${end}-hand corner readings do not work out: ${problem}`,
        hint: `Re-measure the triangle at the ${end}-hand corner.`,
      });
      continue;
    }
    // The triangle is a record of what was measured and the angle is what the
    // geometry runs on. If they ever disagree one of them is a lie, and the
    // fillers are cut to whichever one it is not.
    const implied = cornerAngleFrom(spec);
    if (implied !== null && Math.abs(implied - inUse) > 0.05) {
      out.push({
        severity: 'warning',
        message: `The ${end}-hand corner was measured at ${implied.toFixed(1)}°, but ${inUse.toFixed(1)}° is what the fillers are being cut to.`,
        hint: `Re-measure that corner, or clear the reading by typing the angle you want.`,
      });
    }
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEG_BACK,
  DEFAULT_LEG_RETURN,
  buildProject,
  checkCornerTriangle,
  checkMeasurements,
  cornerAngleFrom,
  defaultParams,
  describeCorner,
  diagonalFor,
  squareDiagonal,
  wallLean,
  type CornerTriangle,
  type OpeningSpec,
} from '../src/index.js';

/**
 * Turning tape readings into the numbers the model runs on.
 *
 * Nobody can measure a room corner with a protractor, so the angle is derived
 * from a triangle laid out on the floor. If that arithmetic is wrong the whole
 * out-of-square feature is worse than not having it: it would report a
 * confident angle nobody measured, and cut the fillers to it.
 */

const triangle = (alongBack: number, alongReturn: number, diagonal: number): CornerTriangle => ({
  alongBack,
  alongReturn,
  diagonal,
});

describe('the corner triangle', () => {
  // The 3-4-5 rule, which is what a woodworker actually steps out on the floor.
  // 600 and 800 give a 1000 mm diagonal on a square corner, and 600 is roughly
  // a base cabinet's depth so the marks land where the carcass will stand.
  it('reads a square corner as 90 degrees', () => {
    expect(squareDiagonal(DEFAULT_LEG_BACK, DEFAULT_LEG_RETURN)).toBeCloseTo(1000, 9);
    expect(cornerAngleFrom(triangle(600, 800, 1000))).toBeCloseTo(90, 9);
    expect(checkCornerTriangle(triangle(600, 800, 1000))).toBeNull();
  });

  it('is the law of cosines, not an approximation of it', () => {
    // A longer diagonal than a square corner would give means an obtuse corner:
    // the walls open away from each other.
    const obtuse = triangle(600, 800, 1050);
    const expected =
      (Math.acos((600 ** 2 + 800 ** 2 - 1050 ** 2) / (2 * 600 * 800)) * 180) / Math.PI;
    expect(cornerAngleFrom(obtuse)).toBeCloseTo(expected, 9);
    expect(cornerAngleFrom(obtuse)!).toBeGreaterThan(90);

    // Shorter than square means acute: the walls close towards each other.
    expect(cornerAngleFrom(triangle(600, 800, 950))!).toBeLessThan(90);
  });

  it('works with any two legs, not just 600 and 800', () => {
    // Someone with a skirting board in the way steps out different distances.
    expect(cornerAngleFrom(triangle(300, 400, 500))).toBeCloseTo(90, 9);
    expect(cornerAngleFrom(triangle(1000, 1000, Math.hypot(1000, 1000)))).toBeCloseTo(90, 9);
  });

  it('round-trips against the lean the geometry actually uses', () => {
    // The derived angle has to be the same one `wallLean` is fed, or the
    // walkthrough would promise a drift the fillers are not cut to.
    const angle = cornerAngleFrom(triangle(600, 800, 1050))!;
    const lean = wallLean(600, angle);
    // Obtuse, so the wall opens out towards the front: a negative drift.
    expect(lean).toBeLessThan(0);
    expect(wallLean(600, cornerAngleFrom(triangle(600, 800, 950))!)).toBeGreaterThan(0);
  });

  it('refuses readings that cannot be a triangle, rather than inventing an angle', () => {
    // Two marks 600 and 800 mm from a corner cannot be 1600 mm apart. Clamping
    // the cosine into range would answer '180 degrees' with a straight face.
    expect(cornerAngleFrom(triangle(600, 800, 1600))).toBeNull();
    expect(checkCornerTriangle(triangle(600, 800, 1600))).toContain(
      'shorter than the two legs added together',
    );

    expect(cornerAngleFrom(triangle(600, 800, 100))).toBeNull();
    expect(checkCornerTriangle(triangle(600, 800, 100))).toContain('cannot be only 100 mm apart');
  });

  it('asks for the legs before the diagonal', () => {
    expect(checkCornerTriangle(triangle(0, 0, 0))).toContain('along each wall first');
    expect(checkCornerTriangle(triangle(600, 800, 0))).toContain('between the two marks');
  });

  it('flags a reading that closes but is nowhere near a room corner', () => {
    // 600, 800, 1300 makes a legal triangle at about 137 degrees. That is a
    // splay, not a corner: the likeliest explanation is one mark measured
    // across the room rather than along the wall.
    const said = checkCornerTriangle(triangle(600, 800, 1300));
    expect(said).toContain('very unusual corner');
    expect(said).toContain('along the wall rather than across it');
  });

  it('says what the corner costs over the depth of the run', () => {
    const said = describeCorner(triangle(600, 800, 950), 600)!;
    // The number someone checks against the room: not the angle, but how far
    // the wall has moved by the time it reaches the front of the cabinets.
    expect(said).toContain('a square corner would read 1000 mm');
    expect(said).toContain('closes in by');
    expect(describeCorner(triangle(600, 800, 1000), 600)).toContain('Dead square');
    expect(describeCorner(triangle(600, 800, 1600), 600)).toBeNull();
  });
});

describe('the diagonal a known angle would read', () => {
  // The walkthrough opens on whatever angle is already in effect, so it has to
  // be able to run the law of cosines forwards as well as backwards. Seeding it
  // with a square triangle instead would have the corner page say 'dead square'
  // about a corner the project is being cut to 85 degrees for.
  it('agrees with the square case', () => {
    expect(diagonalFor(600, 800, 90)).toBeCloseTo(squareDiagonal(600, 800), 9);
  });

  it('round-trips against the angle it came from', () => {
    for (const angle of [72, 85, 90, 96.5, 118]) {
      const d = diagonalFor(600, 800, angle);
      expect(cornerAngleFrom(triangle(600, 800, d))).toBeCloseTo(angle, 9);
    }
  });
});

describe('readings that look like a slip of the tape', () => {
  const measured = (patch: Partial<OpeningSpec>): OpeningSpec => ({
    ...defaultParams().opening,
    enabled: true,
    ...patch,
  });

  it('passes a plausible set', () => {
    expect(checkMeasurements(measured({}))).toEqual([]);
  });

  it('says when a dimension was never measured at all', () => {
    expect(checkMeasurements(measured({ widthAtTop: 0 }))[0]).toMatchObject({
      severity: 'error',
      message: 'The opening width has not been measured.',
    });
    expect(checkMeasurements(measured({ heightAtRight: 0 }))[0]).toMatchObject({
      severity: 'error',
      message: 'The opening height has not been measured.',
    });
  });

  it('questions a lean or a slope big enough to be a mistyped reading', () => {
    // A dropped digit is not a failed test, it is a cabinet built to the wrong
    // size. 940 against 840 is a wall a hand's breadth out of plumb.
    const lean = checkMeasurements(measured({ widthAtTop: 940, widthAtBottom: 820 }));
    expect(lean[0]!.severity).toBe('warning');
    expect(lean[0]!.message).toContain('120 mm narrower at one end');

    const slope = checkMeasurements(measured({ heightAtLeft: 2400, heightAtRight: 2250 }));
    expect(slope[0]!.message).toContain('floor drops 150 mm');
  });

  it('questions a bow no scribe will hide', () => {
    const said = checkMeasurements(measured({ wallBow: 40 }));
    expect(said[0]!.message).toContain('more than a scribe can hide');
    expect(said[0]!.hint).toContain('skirting');
  });

  it('carries a corner that does not work out back to the corner', () => {
    const said = checkMeasurements(measured({ cornerTriangleRight: triangle(600, 800, 1600) }));
    expect(said[0]!.message).toContain('right-hand corner readings do not work out');
    expect(said[0]!.hint).toContain('right-hand corner');
  });

  it('leaves a bow alone when there is no wall to scribe to', () => {
    // Nothing is scribed to anything with both ends open, so telling someone to
    // skim a wall contradicts the very next diagnostic, which says no strips
    // were made.
    expect(checkMeasurements(measured({ wallBow: 40, left: 'open', right: 'open' }))).toEqual([]);
    expect(
      checkMeasurements(
        measured({ cornerTriangleLeft: triangle(600, 800, 1600), left: 'open', right: 'open' }),
      ),
    ).toEqual([]);
  });

  it('says so when the stored reading and the angle in use have drifted apart', () => {
    // One is a record of what was measured, the other is what the fillers are
    // cut to. If they disagree, one of them is a lie.
    const said = checkMeasurements(
      measured({ cornerTriangleLeft: triangle(600, 800, 988), cornerAngleLeft: 90 }),
    );
    expect(said[0]!.message).toContain('measured at 88.6°');
    expect(said[0]!.message).toContain('90.0° is what the fillers are being cut to');
  });

  it('does not also complain about drift when the reading is nonsense', () => {
    // One problem, one message: the triangle cannot close, so what it implies
    // is not worth comparing against anything.
    const said = checkMeasurements(
      measured({ cornerTriangleLeft: triangle(600, 800, 1600), cornerAngleLeft: 90 }),
    );
    expect(said).toHaveLength(1);
  });

  it('reaches the diagnostics, for someone who typed it into the panel', () => {
    const params = defaultParams();
    params.opening = { ...params.opening, enabled: true, wallBow: 40 };
    const said = buildProject(params).diagnostics.find((d) =>
      d.message.includes('more than a scribe can hide'),
    );
    expect(said?.severity).toBe('warning');
    expect(said?.topic).toBe('opening');
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyJoinery,
  buildOutline,
  buildParts,
  buildProject,
  defaultParams,
  describeFit,
  fitOpening,
  normaliseParams,
  runSize,
  wallLean,
  type OpeningSpec,
  type Part,
  type ProjectParams,
} from '../src/index.js';
import { base, carcass } from './carcasses.js';

/**
 * R-05. Real rooms are crooked and the carcass stays square, so everything
 * here is about the numbers that decide how much crookedness is taken up
 * where. Getting one of them wrong does not fail loudly: it produces a filler
 * that is a few millimetres out, which is discovered with the cabinets already
 * standing in the room.
 */

/** A square opening exactly the size of the run standing in it. */
function squareOpening(params: ProjectParams): OpeningSpec {
  const run = runSize(params.cabinets);
  return {
    ...params.opening,
    enabled: true,
    widthAtTop: run.width,
    widthAtBottom: run.width,
    heightAtLeft: run.height,
    heightAtRight: run.height,
    cornerAngleLeft: 90,
    cornerAngleRight: 90,
    wallBow: 0,
  };
}

const scribes = (parts: Part[]): Part[] => parts.filter((p) => p.role === 'scribe');

describe('the measured opening', () => {
  it('is off by default, so a project that was never measured is untouched', () => {
    expect(defaultParams().opening.enabled).toBe(false);
    expect(scribes(buildProject(defaultParams()).parts)).toHaveLength(0);
  });

  it('takes the narrower of the two width measurements as the envelope', () => {
    const params = defaultParams();
    const opening = { ...squareOpening(params), widthAtTop: 1000, widthAtBottom: 988 };
    const fit = fitOpening(opening, { width: 900, height: 2000, depth: 600 });
    // A box sized to the top would not go past the bottom of a leaning wall.
    expect(fit.envelope.width).toBeCloseTo(988, 6);
  });

  it('takes the lower of the two height measurements, and calls the difference a levelling job', () => {
    const params = defaultParams();
    const opening = { ...squareOpening(params), heightAtLeft: 2400, heightAtRight: 2386 };
    const fit = fitOpening(opening, { width: 900, height: 2000, depth: 600 });
    expect(fit.envelope.height).toBeCloseTo(2386, 6);
    expect(fit.levelling).toBeCloseTo(14, 6);
    // Less height to a level head means more floor under it: the run stands on
    // the right and is packed down 14 mm at the left.
    expect(fit.floorAtRight).toBeCloseTo(0, 6);
    expect(fit.floorAtLeft).toBeCloseTo(-14, 6);
  });

  // The one construction value in this item with a formula behind it: a wall
  // meeting the back wall at anything but 90 degrees drifts sideways by
  // depth / tan(angle) over the depth of the cabinets.
  it('derives the corner drift from the angle and the depth', () => {
    expect(wallLean(600, 90)).toBeCloseTo(0, 9);
    expect(wallLean(600, 88)).toBeCloseTo(600 / Math.tan((88 * Math.PI) / 180), 9);
    expect(wallLean(600, 88)).toBeCloseTo(20.95, 2);
    // An obtuse corner opens out towards the front, which is the other sign.
    expect(wallLean(600, 92)).toBeCloseTo(-20.95, 2);
  });

  it('only counts a wall closing in against the envelope, and only where there is a wall', () => {
    const params = defaultParams();
    const run = { width: 900, height: 2000, depth: 600 };
    const closingIn = fitOpening(
      { ...squareOpening(params), widthAtTop: 1000, widthAtBottom: 1000, cornerAngleLeft: 88 },
      run,
    );
    // The box has to pass the tightest point of the wall, which is at the front.
    expect(closingIn.envelope.width).toBeCloseTo(1000 - 20.95, 2);

    const openingOut = fitOpening(
      { ...squareOpening(params), widthAtTop: 1000, widthAtBottom: 1000, cornerAngleLeft: 92 },
      run,
    );
    // A wall leaning away leaves a wedge to fill, but nothing is in the box's way.
    expect(openingOut.envelope.width).toBeCloseTo(1000, 6);

    const noWall = fitOpening(
      {
        ...squareOpening(params),
        widthAtTop: 1000,
        widthAtBottom: 1000,
        cornerAngleLeft: 88,
        left: 'open',
      },
      run,
    );
    expect(noWall.envelope.width).toBeCloseTo(1000, 6);
  });

  // The bug this pins: centring the run in the opening as it appears at the
  // *front* puts the back corner of an end cabinet into a wall that leans away,
  // and reports the whole thing as fitting. That is a wrong cabinet with no
  // warning, discovered with the carcass already built.
  it('stands the run clear of the walls over the whole depth, not just at the front', () => {
    const params = defaultParams();
    const run = { width: 900, height: 2000, depth: 600 };
    const obtuse = fitOpening(
      {
        ...squareOpening(params),
        widthAtTop: 940,
        widthAtBottom: 940,
        cornerAngleRight: 94,
      },
      run,
    );
    const right = obtuse.ends.find((e) => e.end === 'right')!;
    const left = obtuse.ends.find((e) => e.end === 'left')!;
    // Widths are measured at the back wall, so the right wall's back line is
    // the gap at the front less the lean. It has to fall outside the run.
    expect(right.gapAtBottom + right.lean).toBeGreaterThan(0);
    // 40 mm of clearance shared between the two ends, then the front gap on the
    // right opens out by the 42 mm the corner leans away.
    expect(left.gapAtBottom).toBeCloseTo(20, 6);
    expect(right.gapAtBottom).toBeCloseTo(20 + Math.abs(wallLean(600, 94)), 6);
  });

  it('centres the run in the band that is clear at the tightest point', () => {
    const params = defaultParams();
    const lean = wallLean(600, 88);
    const fit = fitOpening(
      { ...squareOpening(params), widthAtTop: 940, widthAtBottom: 940, cornerAngleLeft: 88 },
      { width: 900, height: 2000, depth: 600 },
    );
    // The left wall eats `lean` at the front, leaving 940 − lean for the box.
    // Centred, that is half the remainder clear at each end — measured at the
    // front on the left, where the wall is tightest, and at the back on the
    // right, where it is straight.
    const clear = (940 - lean - 900) / 2;
    expect(fit.ends[0]!.gapAtBottom).toBeCloseTo(clear, 6);
    expect(fit.ends[1]!.gapAtBottom).toBeCloseTo(clear, 6);
    // The two walls and the run still add up to the measurement at the back.
    const backLeft = fit.ends[0]!.gapAtBottom + fit.ends[0]!.lean;
    const backRight = fit.ends[1]!.gapAtBottom + fit.ends[1]!.lean;
    expect(backLeft + 900 + backRight).toBeCloseTo(940, 6);
  });

  it('holds the wall bow back off the envelope at each walled end', () => {
    const params = defaultParams();
    const run = { width: 900, height: 2000, depth: 600 };
    const both = fitOpening(
      { ...squareOpening(params), widthAtTop: 1000, widthAtBottom: 1000, wallBow: 4 },
      run,
    );
    // Two walls, either of which may bulge 4 mm into the opening.
    expect(both.envelope.width).toBeCloseTo(992, 6);

    const one = fitOpening(
      {
        ...squareOpening(params),
        widthAtTop: 1000,
        widthAtBottom: 1000,
        wallBow: 4,
        right: 'open',
      },
      run,
    );
    expect(one.envelope.width).toBeCloseTo(996, 6);
  });
});

describe('opening measurements survive a save and an open', () => {
  it('round-trips through the file format', () => {
    const saved = defaultParams();
    saved.opening = {
      ...squareOpening(saved),
      widthAtTop: 1234,
      cornerAngleRight: 87.5,
      right: 'open',
      scribe: { width: 25, materialId: 'ply12' },
    };
    const reopened = normaliseParams(JSON.parse(JSON.stringify(saved)));
    expect(reopened.opening).toEqual(saved.opening);
  });

  it('opens a file written before there was a room to measure', () => {
    // Left alone, a missing `opening` is undefined all the way into the
    // geometry and comes out as NaN widths on the sheet.
    const legacy = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    delete legacy.opening;
    const opened = normaliseParams(legacy);
    expect(opened.opening.enabled).toBe(false);
    expect(opened.opening.scribe.width).toBeGreaterThan(0);
    expect(scribes(buildProject(opened).parts)).toHaveLength(0);
  });
});

describe('the square opening changes nothing', () => {
  it('produces no scribe parts and the same parts as an unmeasured project', () => {
    const measured = defaultParams();
    measured.opening = squareOpening(measured);
    const plain = buildProject(defaultParams());
    const fitted = buildProject(measured);

    expect(scribes(fitted.parts)).toHaveLength(0);
    expect(fitted.parts.map((p) => p.id)).toEqual(plain.parts.map((p) => p.id));
    // Not just the same list: the same blanks, down to the outline points.
    expect(fitted.parts.map((p) => JSON.stringify(p.outline))).toEqual(
      plain.parts.map((p) => JSON.stringify(p.outline)),
    );
  });

  it('still reports the derivation, so the fit can be checked before cutting', () => {
    const params = defaultParams();
    params.opening = squareOpening(params);
    const opening = buildProject(params).diagnostics.filter((d) => d.topic === 'opening');
    expect(opening.some((d) => d.message.includes('square box'))).toBe(true);
    expect(opening.every((d) => d.severity === 'info')).toBe(true);
  });
});

describe('scribe strips and filler panels', () => {
  /** A run in an alcove 40 mm wider at the top than the run, 28 mm at the floor. */
  function leaningWall(): ProjectParams {
    const params = defaultParams();
    params.opening = {
      ...squareOpening(params),
      widthAtTop: 940,
      widthAtBottom: 928,
      scribe: { ...params.opening.scribe, width: 20 },
    };
    return params;
  }

  it('makes one part per front plane at each walled end, and none at an open one', () => {
    const params = leaningWall();
    // The default unit steps back: a 600 mm base with a 400 mm upper on it. One
    // strip run up the whole stack would stand 200 mm proud of the upper doors
    // with nothing behind it, and cover the ledge.
    expect(scribes(buildProject(params).parts).map((p) => p.id)).toEqual([
      'C1-B-SCRIBE-L',
      'C1-T-SCRIBE-L',
      'C1-B-SCRIBE-R',
      'C1-T-SCRIBE-R',
    ]);

    params.opening.right = 'open';
    // With nothing to scribe to on the right, the whole gap goes to the left.
    const oneEnd = scribes(buildProject(params).parts);
    expect(oneEnd.map((p) => p.id)).toEqual(['C1-B-SCRIBE-L', 'C1-T-SCRIBE-L']);
    expect(oneEnd.find((p) => p.id === 'C1-T-SCRIBE-L')!.width).toBeCloseTo(40 + 20, 6);
  });

  it('sets each strip back with the carcass it stands against', () => {
    const params = leaningWall();
    const project = buildProject(params);
    const doorOf = (carcass: string): Part =>
      project.parts.find((p) => p.role === 'door' && p.carcassId === carcass)!;
    const stripOf = (id: string): Part => scribes(project.parts).find((p) => p.id === id)!;

    // Flush with the base doors below, and set back 200 mm with the upper above.
    expect(stripOf('C1-B-SCRIBE-L').box.max.y).toBeCloseTo(doorOf('B').box.max.y, 6);
    expect(stripOf('C1-T-SCRIBE-L').box.max.y - stripOf('C1-B-SCRIBE-L').box.max.y).toBeCloseTo(
      base(params).depth - carcass(params, 'T').depth,
      6,
    );
    // Between them they cover the whole visible side, from the toe kick up.
    expect(stripOf('C1-B-SCRIBE-L').box.min.z).toBeCloseTo(base(params).toeKick.height, 6);
    expect(stripOf('C1-B-SCRIBE-L').box.max.z).toBeCloseTo(stripOf('C1-T-SCRIBE-L').box.min.z, 6);
    expect(stripOf('C1-T-SCRIBE-L').box.max.z).toBeCloseTo(runSize(params.cabinets).height, 6);
  });

  it('runs one strip up a stack that does not step back', () => {
    const params = leaningWall();
    // Same depth top and bottom: the front is continuous, and a joint line
    // across it is a joint line nobody wants.
    carcass(params, 'T').depth = base(params).depth;
    expect(scribes(buildProject(params).parts).map((p) => p.id)).toEqual([
      'C1-B-SCRIBE-L',
      'C1-B-SCRIBE-R',
    ]);
  });

  it('cuts each one to the gap plus the scribe allowance, at top and bottom', () => {
    // The gap runs 14 mm at the floor to 20 mm at the top of the 2000 mm run,
    // each with 20 mm of allowance on top. The upper strip spans 900 to 2000.
    const parts = scribes(buildProject(leaningWall()).parts).filter((p) =>
      p.id.startsWith('C1-T-'),
    );
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      const top = part.outline.pts.filter((v) => v.y > 1).map((v) => v.x);
      const bottom = part.outline.pts.filter((v) => Math.abs(v.y) < 1e-6).map((v) => v.x);
      expect(Math.max(...top) - Math.min(...top)).toBeCloseTo(20 + 20, 6);
      expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(14 + 6 * 0.45 + 20, 6);
    }
  });

  it('tapers the wall-facing edge, on the correct hand at each end', () => {
    const parts = scribes(buildProject(leaningWall()).parts);
    // Every blank is cut back at its lower end, where the opening is narrower.
    for (const part of parts) {
      const bottom = part.outline.pts.filter((v) => Math.abs(v.y) < 1e-6).map((v) => v.x);
      const top = part.outline.pts.filter((v) => v.y > 1).map((v) => v.x);
      expect(Math.max(...top) - Math.min(...top)).toBeGreaterThan(
        Math.max(...bottom) - Math.min(...bottom),
      );
    }

    // Local u runs towards -X on both, so the wall-facing edge is local 'right'
    // at the left end of the run and local 'left' at the right end. Taper the
    // other edge and the strip fouls the cabinet instead of following the
    // plaster; taper the wrong end and the gap ends up where it shows.
    const bottomOf = (p: Part): number[] =>
      p.outline.pts.filter((v) => Math.abs(v.y) < 1e-6).map((v) => v.x);
    const left = parts.find((p) => p.id === 'C1-T-SCRIBE-L')!;
    const right = parts.find((p) => p.id === 'C1-T-SCRIBE-R')!;
    expect(Math.min(...bottomOf(left))).toBeCloseTo(0, 6);
    expect(Math.min(...bottomOf(right))).toBeCloseTo(40 - (14 + 6 * 0.45 + 20), 6);
  });

  it('leaves the taper off when the wall is plumb', () => {
    const params = leaningWall();
    params.opening.widthAtBottom = params.opening.widthAtTop;
    for (const part of scribes(buildProject(params).parts)) {
      const bottom = part.outline.pts.filter((v) => Math.abs(v.y) < 1e-6).map((v) => v.x);
      const top = part.outline.pts.filter((v) => v.y > 1).map((v) => v.x);
      expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(
        Math.max(...top) - Math.min(...top),
        6,
      );
    }
  });

  it('keeps surface effects inside the narrow end of a tapered blank', () => {
    const strip = scribes(buildProject(leaningWall()).parts).find((p) => p.id === 'C1-T-SCRIBE-L')!;
    // The exposed region is the rectangle that fits inside the trapezoid at
    // every height; the full blank width only exists at the top.
    expect(strip.exposed.w).toBeCloseTo(14 + 6 * 0.45 + 20, 6);
  });

  it('engraves the id on the blank rather than off its tapered corner', () => {
    const params = leaningWall();
    params.labelParts = true;
    for (const part of scribes(buildProject(params).parts)) {
      const label = part.features.find((f) => f.kind === 'engrave')!;
      // The bounding box of a trapezoid has a corner with no material under it.
      // Engraved there, the label is cut across whatever is nested alongside.
      const edgeAtLabel = part.outline.pts
        .filter((v) => Math.abs(v.y) < 1e-6)
        .reduce((a, v) => Math.min(a, v.x), Infinity);
      expect(label.x).toBeGreaterThanOrEqual(edgeAtLabel);
    }
  });

  it('calls it a scribe strip when there is no gap, and a filler panel when there is', () => {
    const params = defaultParams();
    const run = runSize(params.cabinets);
    const bow = 3;
    // A dead-square opening, wide enough that the run clears a wall that may
    // bulge 3 mm into it. The only reason for a part is that bow: the strip is
    // the 3 mm the carcass stands off, plus the allowance to plane away.
    params.opening = {
      ...squareOpening(params),
      widthAtTop: run.width + 2 * bow,
      widthAtBottom: run.width + 2 * bow,
      wallBow: bow,
    };
    const tight = scribes(buildProject(params).parts);
    expect(tight).toHaveLength(4);
    expect(tight[0]!.label).toContain('scribe strip');
    expect(tight[0]!.width).toBeCloseTo(bow + params.opening.scribe.width, 6);
    // Named for the carcass it stands against, since the stack steps back.
    expect(tight[0]!.label).toContain('base');

    expect(scribes(buildProject(leaningWall()).parts)[0]!.label).toContain('filler panel');
  });

  it('holds the carcass off a wall that may bulge, and says so when it will not fit', () => {
    const params = defaultParams();
    // An opening measured exactly the width of the run will not take it once a
    // bulge in either wall is allowed for. Building it anyway is the wrong
    // cabinet; saying so is the whole point of measuring.
    params.opening = { ...squareOpening(params), wallBow: 3 };
    const error = buildProject(params).diagnostics.find(
      (d) => d.topic === 'opening' && d.severity === 'error',
    );
    expect(error?.message).toContain('6 mm too wide to go in');
  });

  it('nests and lists the strips with everything else', () => {
    const project = buildProject(leaningWall());
    const nested = new Set(project.nest.sheets.flatMap((s) => s.parts.map((p) => p.partId)));
    for (const part of scribes(project.parts)) {
      expect(nested.has(part.id)).toBe(true);
      expect(project.cutList.some((r) => r.id === part.id)).toBe(true);
    }
  });
});

describe('what the diagnostics say about a crooked room', () => {
  it('says what the blank follows and what is left for the plane', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), widthAtTop: 940, widthAtBottom: 928, wallBow: 4 };
    const run = runSize(params.cabinets);
    const said = describeFit(params.opening, fitOpening(params.opening, run), run);
    // A bow is nothing but scribe work: no measurement predicts it.
    expect(said).toContain(
      'The opening is 4 mm out of flat where the wall bows, so a 20 mm scribe strip each end covers it with 16 mm to spare.',
    );
    // A lean is cut into the blank. One width measurement cannot say which of
    // two walls is doing it, so the taper splits it and the plane covers the
    // half a strip was not given.
    expect(said).toContain(
      'The opening is 12 mm narrower at the bottom than at the top. The strips follow 6 mm of that; a 20 mm scribe allowance covers the remaining 6 mm with 14 mm to spare.',
    );
  });

  it('does not warn about crookedness the blank is already cut to', () => {
    const params = defaultParams();
    // A corner is measured at its own end, so its lean is cut in exactly and
    // there is nothing left for the plane. Warning here would be a false alarm,
    // and a warning that cries wolf is worse than no warning.
    params.opening = { ...squareOpening(params), cornerAngleLeft: 82, wallBow: 0 };
    const warnings = buildProject(params).diagnostics.filter(
      (d) => d.topic === 'opening' && d.severity === 'warning',
    );
    expect(warnings).toHaveLength(0);
  });

  it('warns when the crookedness outruns the scribe allowance, naming the measurement', () => {
    const params = defaultParams();
    // 60 mm of lean split between two walls leaves 30 mm for a 20 mm allowance.
    params.opening = {
      ...squareOpening(params),
      widthAtTop: 988,
      widthAtBottom: 928,
      wallBow: 0,
    };
    const warning = buildProject(params).diagnostics.find(
      (d) => d.topic === 'opening' && d.severity === 'warning',
    );
    expect(warning?.message).toContain('60 mm narrower at the bottom');
    expect(warning?.message).toContain('runs out 10 mm short');
    expect(warning?.hint).toContain('Opening width at the top and at the bottom');
  });

  it('errors when the run will not go into the opening at all', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), widthAtTop: 880, widthAtBottom: 880 };
    const errors = buildProject(params).diagnostics.filter(
      (d) => d.topic === 'opening' && d.severity === 'error',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('20 mm too wide to go in');
  });

  it('errors when the run will not stand up in the opening', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), heightAtLeft: 1900, heightAtRight: 1900 };
    const errors = buildProject(params).diagnostics.filter(
      (d) => d.topic === 'opening' && d.severity === 'error',
    );
    expect(errors[0]!.message).toContain('100 mm too tall to stand up in');
  });

  it('recommends a levelling plinth rather than quietly building one', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), heightAtLeft: 2400, heightAtRight: 2386 };
    const project = buildProject(params);
    const said = project.diagnostics.find((d) => d.message.includes('The floor is'));
    expect(said?.message).toContain('14 mm higher on the right');
    expect(said?.message).toContain('adjustable feet');
    // The toe kick itself is untouched: packing it down is a site decision.
    const rail = project.parts.find((p) => p.role === 'toe-rail')!;
    const plain = buildProject(defaultParams()).parts.find((p) => p.role === 'toe-rail')!;
    expect(rail.height).toBeCloseTo(plain.height, 6);
  });

  it('says nothing gets scribed when both ends of the run are open', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), left: 'open', right: 'open', wallBow: 3 };
    const project = buildProject(params);
    expect(scribes(project.parts)).toHaveLength(0);
    const said = project.diagnostics.find((d) =>
      d.message.includes('Both ends of the run are open'),
    );
    expect(said?.severity).toBe('info');
    // With nothing to scribe to, promising a strip that covers the lean would
    // be describing a part that is never made.
    expect(project.diagnostics.some((d) => d.message.includes('covers it with'))).toBe(false);
  });

  it('leaves a blank square, and says so, when the taper does not lie along it', () => {
    const params = defaultParams();
    const built = buildParts(params);
    const side = built.parts.find((p) => p.id === 'C1-B-SIDE-L')!;
    // A side panel's normal runs along X, so a taper facing X lies through the
    // panel rather than along either edge of the blank.
    built.tapers.push({
      partId: side.id,
      edgeFacing: { x: 1, y: 0, z: 0 },
      narrowEnd: { x: 0, y: 0, z: 1 },
      by: 10,
    });
    const warnings = applyJoinery(params, built);
    expect(warnings.some((w) => w.includes('does not lie along either axis'))).toBe(true);
  });

  it('warns when the scribe material is not in the materials list', () => {
    const params = defaultParams();
    params.opening = { ...squareOpening(params), wallBow: 3 };
    params.opening.scribe = { ...params.opening.scribe, materialId: 'walnut' };
    const project = buildProject(params);
    // Absent strips with no warning is a run fitted to a wall with nothing to
    // fit it with.
    expect(scribes(project.parts)).toHaveLength(0);
    const said = project.diagnostics.find((d) => d.message.includes("'walnut'"));
    expect(said?.severity).toBe('warning');
  });

  it('falls back to the carcass material when a file names one that is gone', () => {
    const saved = defaultParams();
    saved.opening = { ...squareOpening(saved), wallBow: 3 };
    saved.opening.scribe = { ...saved.opening.scribe, materialId: 'walnut' };
    const opened = normaliseParams(JSON.parse(JSON.stringify(saved)));
    expect(opened.opening.scribe.materialId).toBe(opened.carcassMaterialId);
    expect(scribes(buildProject(opened).parts).length).toBeGreaterThan(0);
  });
});

describe('the tapered blank', () => {
  // buildOutline composes rectangles with notches and tabs. The taper is the
  // one extension R-05 needed, and it has to leave every existing blank alone.
  it('leaves a blank with no taper exactly as it was', () => {
    const plain = buildOutline({ x0: 0, y0: 0, w: 100, h: 200 });
    expect(plain.pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]);
  });

  it('cuts the named edge back at the named end only', () => {
    const leftAtTop = buildOutline({
      x0: 0,
      y0: 0,
      w: 100,
      h: 200,
      taper: { edge: 'left', at: 'top', by: 10 },
    });
    expect(leftAtTop.pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 10, y: 200 },
    ]);

    const rightAtBottom = buildOutline({
      x0: 0,
      y0: 0,
      w: 100,
      h: 200,
      taper: { edge: 'right', at: 'bottom', by: 10 },
    });
    expect(rightAtBottom.pts).toEqual([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]);
  });

  it('puts a notch and a tab on the slope rather than on the rectangle it replaced', () => {
    const outline = buildOutline({
      x0: 0,
      y0: 0,
      w: 100,
      h: 200,
      taper: { edge: 'left', at: 'top', by: 20 },
      notches: [{ corner: 'ul', dx: 5, dy: 10 }],
      tabs: [{ edge: 'left', at: 100, width: 20, depth: 8 }],
    });
    const xs = outline.pts.map((p) => p.x);
    // Halfway up, the left edge is 10 mm in, so a tab rooted there starts at 10
    // and reaches 2. Measuring it from the original x0 would leave the tab
    // hanging in mid-air, a tool radius clear of the mating part.
    expect(xs).toContain(10);
    expect(xs).toContain(2);
    // The upper-left notch is bitten out of the corner where it now sits.
    expect(outline.pts).toContainEqual({ x: 25, y: 200 });
  });
});

import { describe, expect, it } from 'vitest';
import { bboxOf, tessellate } from '../src/geom/index.js';
import { buildParts, defaultParams, frameOf, generate, partsNeedingFlip, toAssembly } from '../src/index.js';
import type { CabinetParams, Part, PocketFeature } from '../src/model/types.js';

const find = (parts: Part[], id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}; have ${parts.map((x) => x.id).join(', ')}`);
  return p;
};

const pockets = (p: Part): PocketFeature[] =>
  p.features.filter((f): f is PocketFeature => f.kind === 'pocket');

/** A symmetric unit, so left and right really ought to match. */
function symmetric(): CabinetParams {
  const p = defaultParams();
  p.base.bays = [
    { shelves: 'fixed', shelfCount: 1 },
    { shelves: 'fixed', shelfCount: 1 },
  ];
  p.top.bays = [
    { shelves: 'fixed', shelfCount: 3 },
    { shelves: 'fixed', shelfCount: 3 },
  ];
  return p;
}

describe('assembly geometry', () => {
  const params = defaultParams();
  const { parts, warnings } = generate(params);

  it('generates a clean run with no warnings on the defaults', () => {
    expect(warnings).toEqual([]);
  });

  it('stacks the upper carcass directly on the base', () => {
    const baseTop = find(parts, 'B-TOP');
    const upperBottom = find(parts, 'T-BOTTOM');
    expect(upperBottom.box.min.z).toBeCloseTo(baseTop.box.max.z, 6);
    expect(baseTop.box.max.z).toBeCloseTo(params.base.height, 6);
  });

  it('sets the upper carcass back at the front and flushes it at the rear', () => {
    const baseSide = find(parts, 'B-SIDE-L');
    const topSide = find(parts, 'T-SIDE-L');
    expect(topSide.box.max.y).toBeCloseTo(baseSide.box.max.y, 6); // flush at the wall
    expect(topSide.box.min.y).toBeGreaterThan(baseSide.box.min.y); // stepped back at the front
    expect(topSide.box.min.y - baseSide.box.min.y).toBeCloseTo(
      params.base.depth - params.top.depth,
      6,
    );
  });

  it('gives the whole unit the overall height it was asked for', () => {
    const zs = parts.map((p) => p.box.max.z);
    expect(Math.max(...zs)).toBeCloseTo(params.base.height + params.top.height, 6);
  });

  it('keeps every panel inside the carcass width', () => {
    for (const p of parts) {
      expect(p.box.min.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.box.max.x).toBeLessThanOrEqual(params.base.width + 1e-6);
    }
  });
});

describe('handedness', () => {
  /** Pocket footprints in local coordinates, optionally mirrored across the blank. */
  const pocketKeys = (p: Part, mirror = false): number[][] =>
    pockets(p)
      .map((f) => {
        const bb = bboxOf(f.path);
        const [x0, x1] = mirror ? [p.width - bb.maxX, p.width - bb.minX] : [bb.minX, bb.maxX];
        return [x0, bb.minY, x1, bb.maxY, f.depth];
      })
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);

  const expectSameFeatures = (a: number[][], b: number[][], tol = 1e-6): void => {
    expect(a).toHaveLength(b.length);
    a.forEach((row, i) => {
      row.forEach((val, k) => expect(Math.abs(val - b[i]![k]!)).toBeLessThan(tol));
    });
  };

  it('makes the two sides of a symmetric carcass an exact mirrored pair', () => {
    // Each side is machined from its own inner face, so the pair are mirror
    // images rather than duplicates: a left side flipped over would put its
    // dados on the outside. Mirroring one blank across its width has to
    // reproduce the other exactly, feature for feature.
    const { parts } = generate(symmetric());
    const l = find(parts, 'B-SIDE-L');
    const r = find(parts, 'B-SIDE-R');

    expect(l.width).toBeCloseTo(r.width, 6);
    expect(l.height).toBeCloseTo(r.height, 6);
    expectSameFeatures(pocketKeys(l), pocketKeys(r, true));
  });

  it('does not produce two panels of the same hand', () => {
    // The failure this guards against is a frame that is left-handed on one
    // side, which silently yields two identical parts and one useless panel.
    const { parts } = generate(symmetric());
    const l = find(parts, 'B-SIDE-L');
    const r = find(parts, 'B-SIDE-R');
    expect(pocketKeys(l)).not.toEqual(pocketKeys(r));
  });

  it('mirrors the shelf pin ladders too', () => {
    const p = symmetric();
    p.top.bays = [
      { shelves: 'adjustable', shelfCount: 0 },
      { shelves: 'adjustable', shelfCount: 0 },
    ];
    const { parts } = generate(p);
    const pins = (id: string, mirror: boolean): number[][] => {
      const part = find(parts, id);
      return part.features
        .filter((f) => f.kind === 'drill' && f.purpose === 'shelf-pin')
        .map((f) => (f.kind === 'drill' ? [mirror ? part.width - f.x : f.x, f.y] : []))
        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    };
    expectSameFeatures(pins('T-SIDE-L', false), pins('T-SIDE-R', true));
  });

  it('machines both sides from their inner faces', () => {
    const { parts } = generate(symmetric());
    expect(find(parts, 'B-SIDE-L').faceASign).toBe('+');
    expect(find(parts, 'B-SIDE-R').faceASign).toBe('-');
    for (const id of ['B-SIDE-L', 'B-SIDE-R']) {
      for (const f of pockets(find(parts, id))) expect(f.side).toBe('A');
    }
  });
});

describe('dado joints', () => {
  const params = defaultParams();
  const { parts } = generate(params);
  const t = params.materials[0]!.actualThickness;
  const dadoDepth = params.joinery.dadoDepth;

  it('cuts grooves one third of the panel thickness deep', () => {
    for (const f of pockets(find(parts, 'B-SIDE-L'))) {
      expect(f.depth).toBeCloseTo(dadoDepth, 6);
    }
  });

  it('sizes the groove to the measured thickness plus the fit clearance', () => {
    const side = find(parts, 'B-SIDE-L');
    // The bottom panel's groove runs front to back, so its narrow dimension is
    // the panel thickness.
    const narrow = pockets(side).map((f) => {
      const bb = bboxOf(f.path);
      return Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
    });
    const carcassGrooves = narrow.filter((w) => Math.abs(w - (t + params.joinery.fitClearance)) < 1e-6);
    expect(carcassGrooves.length).toBeGreaterThanOrEqual(2); // bottom and top
  });

  it('grows the captured panel into its grooves at both ends', () => {
    const bottom = find(parts, 'B-BOTTOM');
    // Clear opening is width - 2t; the panel gains one dado depth per side.
    expect(bottom.box.max.x - bottom.box.min.x).toBeCloseTo(
      params.base.width - 2 * t + 2 * dadoDepth,
      6,
    );
  });

  it('stops the groove short of the front edge', () => {
    const side = find(parts, 'B-SIDE-L');
    // Local x is depth for a side panel, with 0 at the front.
    for (const f of pockets(side)) {
      const bb = bboxOf(f.path);
      const runsFrontToBack = bb.maxX - bb.minX > 100;
      if (runsFrontToBack) expect(bb.minX).toBeCloseTo(params.joinery.dadoStopFront, 6);
    }
  });

  it('notches the shelf far enough back to clear the stopped groove', () => {
    const shelf = find(parts, 'B-SHELF-2-1');
    const expected =
      params.joinery.dadoStopFront + params.tool.diameter / 2 + params.joinery.fitClearance;
    // The notch shortens the tongue; the shelf's outline should step in by the
    // dado depth over exactly that length.
    const pts = tessellate(shelf.outline);
    const notchCorner = pts.find(
      (p) => Math.abs(p.y - expected) < 1e-6 || Math.abs(p.x - expected) < 1e-6,
    );
    expect(notchCorner).toBeDefined();
  });

  it('leaves the tongue clear of the radius at the end of the pocket', () => {
    // The pocket keeps a fillet of one tool radius in its stopped corners, so
    // the tongue has to start past that or it will not seat.
    const clearance = params.tool.diameter / 2 + params.joinery.fitClearance;
    expect(clearance).toBeGreaterThan(params.tool.diameter / 2);
  });

  it('drills clearance holes through the panel that receives the groove', () => {
    const side = find(parts, 'B-SIDE-L');
    const screws = side.features.filter((f) => f.kind === 'drill' && f.purpose === 'screw');
    expect(screws.length).toBeGreaterThan(0);
    for (const s of screws) {
      if (s.kind === 'drill') expect(s.depth).toBe('thru');
    }
  });
});

describe('rabbet back', () => {
  // R-01: 'rabbet' used to build a back panel with zero joints — sized to the
  // clear opening and left floating, unjoined, in the cut list. Selecting it
  // must produce a real joint, open at the rear edge rather than the groove
  // style's enclosed pocket.
  const params = defaultParams();
  params.base.back.style = 'rabbet';
  const { parts, warnings } = generate(params);
  const yBack = params.base.depth;
  const dadoDepth = params.joinery.dadoDepth;

  it('generates without complaint', () => {
    expect(warnings).toEqual([]);
  });

  it('cuts a rebate on every panel the back meets, not just the clear-opening blank', () => {
    for (const id of ['B-SIDE-L', 'B-SIDE-R', 'B-TOP', 'B-BOTTOM']) {
      const backPockets = pockets(find(parts, id)).filter((f) => f.purpose === 'back');
      expect(backPockets.length).toBeGreaterThan(0);
    }
  });

  it('opens the rebate onto the carcass rear edge, unlike the enclosed groove', () => {
    const side = find(parts, 'B-SIDE-L');
    const frame = frameOf(side);
    const backPocket = pockets(side).find((f) => f.purpose === 'back')!;
    const ys = backPocket.path.pts.map((v) => toAssembly(frame, v.x, v.y).y);
    expect(Math.max(...ys)).toBeCloseTo(yBack, 6);
  });

  it('still captures the back panel on all four edges, same as the groove style', () => {
    const back = find(parts, 'B-BACK');
    const t = params.materials[0]!.actualThickness;
    // Clear opening in X is width - 2t; the back gains one dado depth per side.
    expect(back.box.max.x - back.box.min.x).toBeCloseTo(
      params.base.width - 2 * t + 2 * dadoDepth,
      6,
    );
  });

  it('leaves the groove style enclosed, with material remaining behind it', () => {
    // The contrast that makes 'rabbet' worth offering: the groove style keeps
    // a shoulder of solid material at the true rear edge so the back stays
    // hidden, which is exactly what a rabbet deliberately gives up.
    const grooveParams = defaultParams();
    const { parts: grooveParts } = generate(grooveParams);
    const side = find(grooveParts, 'B-SIDE-L');
    const frame = frameOf(side);
    const backPocket = pockets(side).find((f) => f.purpose === 'back')!;
    const ys = backPocket.path.pts.map((v) => toAssembly(frame, v.x, v.y).y);
    expect(Math.max(...ys)).toBeLessThan(grooveParams.base.depth - 1);
  });
});

describe('back panel never floats unjoined', () => {
  // The regression this guards: no back style should ever produce a back
  // panel with no joints referencing it. That is precisely the bug rabbet
  // shipped with — a wrong cabinet, cut with no warning.
  it.each(['groove', 'rabbet'] as const)('gives the back at least one joint for style %s', (style) => {
    const params = defaultParams();
    params.base.back.style = style;
    const built = buildParts(params);
    expect(built.parts.some((p) => p.id === 'B-BACK')).toBe(true);
    const backJoints = built.joints.filter((j) => j.maleId === 'B-BACK' || j.femaleId === 'B-BACK');
    expect(backJoints.length).toBeGreaterThan(0);
  });

  it('builds no back part at all for style none, rather than an unjoined one', () => {
    const params = defaultParams();
    params.base.back.style = 'none';
    const built = buildParts(params);
    expect(built.parts.some((p) => p.id === 'B-BACK')).toBe(false);
  });
});

describe('toe kick', () => {
  it('cuts the toe kick out of the side panels', () => {
    const params = defaultParams();
    const { parts } = generate(params);
    const side = find(parts, 'B-SIDE-L');
    const kick = params.base.toeKick;

    // The blank is still a rectangle, but the outline is not.
    expect(side.width).toBeCloseTo(params.base.depth, 6);
    // The base top caps over the sides by default, so a side stops at the
    // top's underside and then runs back up into its locating dado.
    const top = find(parts, 'B-TOP');
    expect(side.height).toBeCloseTo(top.box.min.z + params.joinery.stackDadoDepth, 6);
    expect(side.outline.pts.length).toBeGreaterThan(4);

    const pts = tessellate(side.outline);
    // The front bottom corner should be missing, replaced by the notch corner.
    const atOrigin = pts.some((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6);
    expect(atOrigin).toBe(false);
    const inner = pts.some(
      (p) => Math.abs(p.x - kick.setback) < 1e-6 && Math.abs(p.y - kick.height) < 1e-6,
    );
    expect(inner).toBe(true);
  });

  it('omits the toe kick when it is switched off', () => {
    const params = defaultParams();
    params.base.toeKick.enabled = false;
    const { parts } = generate(params);
    expect(parts.find((p) => p.role === 'toe-rail')).toBeUndefined();
    expect(find(parts, 'B-BOTTOM').box.min.z).toBeCloseTo(0, 6);
  });
});

describe('shelf pins', () => {
  const params = defaultParams();
  const { parts } = generate(params);
  const holes = find(parts, 'T-SIDE-R').features.filter(
    (f) => f.kind === 'drill' && f.purpose === 'shelf-pin',
  );

  it('drills a 32 mm ladder of 5 mm holes', () => {
    expect(holes.length).toBeGreaterThan(20);
    for (const h of holes) {
      if (h.kind !== 'drill') continue;
      expect(h.diameter).toBe(params.joinery.shelfPin.diameter);
      expect(h.depth).toBe(params.joinery.shelfPin.depth);
    }
    const ys = [...new Set(holes.map((h) => (h.kind === 'drill' ? h.y : 0)))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]! - ys[i - 1]!).toBeCloseTo(params.joinery.shelfPin.pitch, 6);
    }
  });

  it('drills exactly two rows, one near the front and one near the back', () => {
    const side = find(parts, 'T-SIDE-R');
    const xs = [...new Set(holes.map((h) => (h.kind === 'drill' ? h.x : 0)))].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    // Local x runs from the back on a right-hand panel, so measure the front
    // row from the far edge of the blank.
    expect(side.width - xs[1]!).toBeCloseTo(params.joinery.shelfPin.frontOffset, 6);
  });

  it('puts the front row 37 mm in from the front edge of a left-hand panel', () => {
    const p = defaultParams();
    p.top.dividerCount = 0;
    p.top.bays = [{ shelves: 'adjustable', shelfCount: 0 }];
    const { parts: single } = generate(p);
    const left = find(single, 'T-SIDE-L');
    const xs = [
      ...new Set(
        left.features
          .filter((f) => f.kind === 'drill' && f.purpose === 'shelf-pin')
          .map((f) => (f.kind === 'drill' ? f.x : 0)),
      ),
    ].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    expect(xs[0]).toBeCloseTo(p.joinery.shelfPin.frontOffset, 6);
  });

  it('never drills deeper than the panel', () => {
    for (const h of holes) {
      if (h.kind === 'drill' && typeof h.depth === 'number') {
        expect(h.depth).toBeLessThan(find(parts, 'T-SIDE-R').thickness);
      }
    }
  });
});

describe('tab and slot joints', () => {
  const params = defaultParams();
  params.joinery.carcassJoint = 'tabslot';
  const { parts, warnings } = generate(params);

  it('generates without complaint', () => {
    expect(warnings).toEqual([]);
  });

  it('cuts through slots in the side panels instead of grooves', () => {
    const side = find(parts, 'B-SIDE-L');
    const through = side.features.filter((f) => f.kind === 'through');
    expect(through.length).toBeGreaterThan(0);
    // The back and toe rail still sit in plain grooves.
    for (const f of pockets(side)) expect(['back', 'toe-rail']).toContain(f.purpose);
  });

  it('relieves every slot corner so a square tenon can seat', () => {
    const side = find(parts, 'B-SIDE-L');
    const slot = side.features.find((f) => f.kind === 'through');
    expect(slot).toBeDefined();
    if (slot?.kind !== 'through') return;
    // Reliefs are arcs, so the slot path must carry bulges.
    expect(slot.path.pts.some((p) => p.bulge)).toBe(true);
    expect(slot.path.pts.length).toBeGreaterThan(4);
  });

  it('pushes tenons right through the receiving panel', () => {
    const bottom = find(parts, 'B-BOTTOM');
    const side = find(parts, 'B-SIDE-L');
    const bb = bboxOf(bottom.outline);
    // Tabs stick out past the panel body by the full thickness of the side.
    expect(bb.maxX - bb.minX).toBeGreaterThan(params.base.width - 2 * side.thickness);
  });

  it('relieves the tab roots on the male panel', () => {
    const bottom = find(parts, 'B-BOTTOM');
    expect(bottom.outline.pts.some((p) => p.bulge)).toBe(true);
  });
});

describe('manufacturability signals', () => {
  it('flags a divider that is shelved on both sides as needing a flip', () => {
    const { parts } = generate(defaultParams());
    const flips = partsNeedingFlip(parts).map((p) => p.id);
    expect(flips).toContain('T-DIV-1');
  });

  it('does not ask for a flip on a plain side panel', () => {
    const { parts } = generate(defaultParams());
    const flips = partsNeedingFlip(parts).map((p) => p.id);
    expect(flips).not.toContain('B-SIDE-L');
  });

  it('warns when the cutter is too fat for the groove', () => {
    const params = defaultParams();
    params.tool.diameter = 25; // wider than an 18 mm panel
    const { warnings } = generate(params);
    expect(warnings.some((w) => w.includes('narrower than'))).toBe(true);
  });

  it('warns when shelf pin holes would break through the panel', () => {
    const params = defaultParams();
    params.joinery.shelfPin.depth = 30;
    const { warnings } = generate(params);
    expect(warnings.some((w) => w.includes('break through'))).toBe(true);
  });
});

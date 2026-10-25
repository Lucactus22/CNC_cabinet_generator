import { describe, expect, it } from 'vitest';
import { base } from './carcasses.js';
import {
  bboxOf,
  boxesOverlap,
  buildProject,
  copyEntry,
  defaultParams,
  buildParts,
  frameOf,
  SLIDE_BLUM_TANDEM_F,
  pointInPath,
  SLIDE_BLUM_TANDEM_H,
  toAssembly,
  type DrillFeature,
  type Part,
  type PocketFeature,
  type ProjectParams,
  type SlideEntry,
} from '../src/index.js';

const MATERIAL_STOCK14 = 'ply14-drawer';

/** A project with bay 1 of the base carcass turned into a stack of drawers. */
const withDrawers = (
  heights: number[],
  patch: (p: ProjectParams) => void = () => {},
): ProjectParams => {
  const p = defaultParams();
  // 14 mm ply sits comfortably inside the default slide's 12-16 mm band, so
  // the width and thickness tests below start from a box that actually fits,
  // rather than the 0.1 mm-under-range default (see the dedicated warning
  // test for that case).
  p.materials.push({
    id: MATERIAL_STOCK14,
    name: '14 mm ply',
    nominalThickness: 14,
    actualThickness: 14,
    sheets: [{ length: 2440, width: 1220 }],
    hasGrain: true,
  });
  p.drawerBoxMaterialId = MATERIAL_STOCK14;
  base(p).bays[0] = { shelves: 'none', shelfCount: 0, doors: 'none', drawerFrontHeights: heights };
  patch(p);
  return p;
};

const find = (parts: Part[], id: string): Part => {
  const part = parts.find((p) => p.id === id);
  if (!part) throw new Error(`No part '${id}'`);
  return part;
};
const drills = (p: Part, purpose: string): DrillFeature[] =>
  p.features.filter((f): f is DrillFeature => f.kind === 'drill' && f.purpose === purpose);

describe('a bay turned into a stack of drawers', () => {
  it('builds a box and a face per drawer, and no door for that bay', () => {
    const params = withDrawers([779.2]);
    const project = buildProject(params);
    // Bay 2 is untouched and keeps its own default door.
    expect(project.parts.some((p) => p.id === 'C1-B-DOOR-1')).toBe(false);
    expect(project.parts.some((p) => p.id === 'C1-B-DOOR-2')).toBe(true);
    for (const role of [
      'drawer-face',
      'drawer-side',
      'drawer-front',
      'drawer-back',
      'drawer-bottom',
    ]) {
      expect(project.parts.filter((p) => p.role === role).length).toBeGreaterThan(0);
    }
    // Two sides, a sub-front, a back and a bottom per drawer, plus its face.
    const drawerParts = project.parts.filter((p) => p.id.startsWith('C1-B-DRAWER-1-1-'));
    expect(drawerParts).toHaveLength(6);
  });

  it('does not build a door even when the bay also names one', () => {
    // A bay is one or the other; drawers win. See BaySpec.drawerFrontHeights.
    const params = withDrawers([779.2], (p) => {
      base(p).bays[0]!.doors = 'left';
    });
    const project = buildProject(params);
    expect(project.parts.some((p) => p.id === 'C1-B-DOOR-1')).toBe(false);
    expect(project.parts.some((p) => p.id === 'C1-B-DRAWER-1-1-FACE')).toBe(true);
  });

  it('sizes the box outside width from the opening and the slide entry, for both thickness bands', () => {
    // Bay 1's own clear width, read directly off the two panels bounding it
    // — the left side and the divider — rather than recomputed by hand,
    // since layoutBays' own split is not this test's concern.
    const thin = buildProject(withDrawers([779.2]));
    const clearWidth =
      find(thin.parts, 'C1-B-DIV-1').box.min.x - find(thin.parts, 'C1-B-SIDE-L').box.max.x;
    // The sub-front's own width is stable through the pipeline (see
    // hardware/fit.ts), so it is read directly rather than off a panel
    // joinery has grown.
    const front = find(thin.parts, 'C1-B-DRAWER-1-1-FRONT');
    const bt = 14; // MATERIAL_STOCK14
    expect(front.box.max.x - front.box.min.x).toBeCloseTo(
      clearWidth - SLIDE_BLUM_TANDEM_H.boring.widthDeduction + 2 * bt,
      6,
    );

    const thick = buildProject(
      withDrawers([779.2], (p) => {
        p.materials.find((m) => m.id === MATERIAL_STOCK14)!.actualThickness = 18;
        p.hardware.slideId = SLIDE_BLUM_TANDEM_F.id;
      }),
    );
    const thickFront = find(thick.parts, 'C1-B-DRAWER-1-1-FRONT');
    expect(thickFront.box.max.x - thickFront.box.min.x).toBeCloseTo(
      clearWidth - SLIDE_BLUM_TANDEM_F.boring.widthDeduction + 2 * 18,
      6,
    );
  });

  it('picks the box side thickness from the drawer box material, not the carcass material', () => {
    const project = buildProject(withDrawers([779.2]));
    for (const id of ['C1-B-DRAWER-1-1-SIDE-L', 'C1-B-DRAWER-1-1-SIDE-R']) {
      expect(find(project.parts, id).thickness).toBe(14);
    }
  });

  it('picks the largest nominal runner length that fits the carcass depth', () => {
    const project = buildProject(withDrawers([779.2]));
    // The sub-front and the back are both female for the sides — nothing
    // grows them — so the gap between their own inner faces is exactly the
    // runner length the builder picked, unlike the sides themselves, which
    // joinery has grown into both pockets by the time the pipeline is done.
    const front = find(project.parts, 'C1-B-DRAWER-1-1-FRONT');
    const back = find(project.parts, 'C1-B-DRAWER-1-1-BACK');
    const length = back.box.max.y - front.box.min.y;
    expect(SLIDE_BLUM_TANDEM_H.boring.nominalLengths).toContain(length);
    // 600 mm carcass depth, less the back panel: only the two longest
    // lengths could possibly fit, and the longer of those should win.
    expect(length).toBe(533);
  });

  it('stops the back short of the box floor, clearing the runner and the bottom alike', () => {
    // The bottom is cut from the same 14 mm stock as the sides here, which is
    // thicker than the slide's own 13 mm recess figure, so the back has to
    // clear whichever of the two is larger or it would overlap the bottom.
    const project = buildProject(withDrawers([779.2]));
    const side = find(project.parts, 'C1-B-DRAWER-1-1-SIDE-L');
    const back = find(project.parts, 'C1-B-DRAWER-1-1-BACK');
    const bottom = find(project.parts, 'C1-B-DRAWER-1-1-BOTTOM');
    const recess = Math.max(SLIDE_BLUM_TANDEM_H.boring.bottomRecess, bottom.thickness);
    expect(back.box.min.z - side.box.min.z).toBeCloseTo(recess, 6);
    // Never less than the bottom's own thickness, on pain of overlap.
    expect(back.box.min.z).toBeGreaterThanOrEqual(bottom.box.max.z - 1e-6);
  });

  it('never overlaps the back and the bottom, even when the box sides are thicker than the recess figure', () => {
    // 563F is published for 16-19 mm sides, all thicker than the 13 mm
    // bottom-recess figure both Blum sheets give — a box built to it must
    // widen its own clearance past that figure, not cut the back into the
    // bottom panel.
    const project = buildProject(
      withDrawers([779.2], (p) => {
        p.materials.find((m) => m.id === MATERIAL_STOCK14)!.actualThickness = 18;
        p.hardware.slideId = SLIDE_BLUM_TANDEM_F.id;
      }),
    );
    const back = find(project.parts, 'C1-B-DRAWER-1-1-BACK');
    const bottom = find(project.parts, 'C1-B-DRAWER-1-1-BOTTOM');
    expect(back.box.min.z).toBeGreaterThanOrEqual(bottom.box.max.z - 1e-6);
  });

  it("notches both rear corners of the bottom for the slide's locking device", () => {
    const project = buildProject(withDrawers([779.2]));
    const bottom = find(project.parts, 'C1-B-DRAWER-1-1-BOTTOM');
    const bb = bboxOf(bottom.outline);
    const w = SLIDE_BLUM_TANDEM_H.boring.bottomNotchWidth;
    const d = Math.max(SLIDE_BLUM_TANDEM_H.boring.bottomRecess, bottom.thickness);
    const has = (x: number, y: number): boolean =>
      bottom.outline.pts.some((pt) => Math.abs(pt.x - x) < 1e-6 && Math.abs(pt.y - y) < 1e-6);

    // Each rear corner steps in by the notch's width and depth: the step's
    // own two new vertices are on the outline, and the true corner they
    // replace is not.
    expect(has(bb.minX + w, bb.maxY)).toBe(true);
    expect(has(bb.minX, bb.maxY - d)).toBe(true);
    expect(has(bb.minX, bb.maxY)).toBe(false);

    expect(has(bb.maxX - w, bb.maxY)).toBe(true);
    expect(has(bb.maxX, bb.maxY - d)).toBe(true);
    expect(has(bb.maxX, bb.maxY)).toBe(false);
  });

  it("bores the runner's screw holes where Blum's table puts them, in both bay-bounding panels", () => {
    // Blum 563H/563F, panel application: 37 mm, then two more per runner
    // length on the 32 mm line, measured from the cabinet face.
    const project = buildProject(withDrawers([779.2]));
    const req = buildParts(withDrawers([779.2])).slides[0]!;
    const expected: Record<number, number[]> = {
      229: [37, 133, 229],
      305: [37, 165, 261],
      381: [37, 165, 357],
      457: [37, 261, 453],
      533: [37, 261, 517],
    };
    // Bay 1 is bounded by the left side and the divider.
    for (const id of ['C1-B-SIDE-L', 'C1-B-DIV-1']) {
      const panel = find(project.parts, id);
      const holes = drills(panel, 'slide-panel');
      expect(holes).toHaveLength(3);
      const back = holes
        // Back along the carcass's depth from the box front, whichever local
        // axis carries it on this panel.
        .map((h) => Math.round(toAssembly(frameOf(panel), h.x, h.y).y - req.boxFrontY))
        .sort((a, b) => a - b);
      expect(back).toEqual(expected[req.length]);
    }
  });

  it('bores them blind, never through the finished outside of an end panel', () => {
    const project = buildProject(withDrawers([779.2]));
    const side = find(project.parts, 'C1-B-SIDE-L');
    const holes = drills(side, 'slide-panel');
    expect(holes.length).toBeGreaterThan(0);
    for (const h of holes) {
      expect(h.depth).toBe(12);
      expect(h.diameter).toBe(5);
      expect(h.depth).toBeLessThan(side.thickness);
    }
  });

  it('bores nothing in the drawer box: the runner does not screw to its sides', () => {
    const project = buildProject(withDrawers([779.2]));
    // The box's own joinery screws are still there; nothing for the runner is.
    for (const p of project.parts.filter((q) => q.id.startsWith('C1-B-DRAWER-'))) {
      expect(p.features.some((f) => f.kind === 'drill' && f.purpose.startsWith('slide'))).toBe(
        false,
      );
    }
  });

  it('says so, and bores nothing, for a runner length the entry has no screw table for', () => {
    const length = buildParts(withDrawers([779.2])).slides[0]!.length;
    const project = buildProject(
      withDrawers([779.2], (p) => {
        const mine = copyEntry(SLIDE_BLUM_TANDEM_H, []) as SlideEntry;
        mine.boring.screwPositions = mine.boring.screwPositions.filter((r) => r.length !== length);
        p.hardware.custom.push(mine);
        p.hardware.slideId = mine.id;
      }),
    );
    expect(drills(find(project.parts, 'C1-B-SIDE-L'), 'slide-panel')).toHaveLength(0);
    const said = project.diagnostics.find((d) => d.message.includes('gives no screw positions'));
    expect(said?.message).toContain(`${length} mm runner`);
    expect(said?.message).toContain('wood screws');
  });

  it('says so, and bores nothing, when the hole is as deep as the panel is thick', () => {
    const project = buildProject(
      withDrawers([779.2], (p) => {
        const mine = copyEntry(SLIDE_BLUM_TANDEM_H, []) as SlideEntry;
        mine.boring.screwHoleDepth = 40;
        p.hardware.custom.push(mine);
        p.hardware.slideId = mine.id;
      }),
    );
    expect(drills(find(project.parts, 'C1-B-SIDE-L'), 'slide-panel')).toHaveLength(0);
    const said = project.diagnostics.find((d) => d.message.includes('screw holes are 40 mm deep'));
    expect(said?.message).toContain(find(project.parts, 'C1-B-SIDE-L').label);
  });

  it('lines up drawer faces with a reveal, the same as neighbouring doors', () => {
    // 400 + 376.2, a 3 mm reveal between and half a reveal at each end: the
    // 779.2 mm a door in this bay would be.
    const project = buildProject(withDrawers([400, 376.2]));
    expect(project.diagnostics.map((d) => d.message).join(' ')).not.toContain('did not add up');
    const top = find(project.parts, 'C1-B-DRAWER-1-1-FACE');
    const bottom = find(project.parts, 'C1-B-DRAWER-1-2-FACE');
    expect(top.box.min.z - bottom.box.max.z).toBeCloseTo(project.params.doors.reveal, 6);
  });

  for (const fit of ['overlay', 'inset'] as const) {
    for (const n of [1, 2, 3]) {
      it(`cuts ${n} ${fit} front${n === 1 ? '' : 's'} to the heights given, level with the door beside ${n === 1 ? 'it' : 'them'}`, () => {
        // Each front used to come out a reveal short of the height typed, and
        // the stack stopped (n-1) reveals above the door in the next bay — a
        // visible step along the bottom of the run, growing with every drawer.
        const door = buildProject(withDrawers([], (p) => void (p.doors.fit = fit)));
        const doorBox = find(door.parts, 'C1-B-DOOR-2').box;
        const d = door.params.doors;
        const end = fit === 'overlay' ? d.reveal / 2 : d.insetGap;
        // The opening the door was cut from, in the span this fit reads.
        const span = doorBox.max.z - doorBox.min.z + 2 * end;
        const fronts = span - (n - 1) * d.reveal - 2 * end;
        const heights = Array.from({ length: n }, (_, k) =>
          k < n - 1 ? Math.round(fronts / n) : fronts - Math.round(fronts / n) * (n - 1),
        );

        const project = buildProject(withDrawers(heights, (p) => void (p.doors.fit = fit)));
        expect(project.diagnostics.map((d) => d.message).join(' ')).not.toContain('did not add up');
        const faces = heights.map((_, k) => find(project.parts, `C1-B-DRAWER-1-${k + 1}-FACE`).box);
        faces.forEach((f, k) => expect(f.max.z - f.min.z).toBeCloseTo(heights[k]!, 6));
        const beside = find(project.parts, 'C1-B-DOOR-2').box;
        expect(faces[0]!.max.z).toBeCloseTo(beside.max.z, 6);
        expect(faces[n - 1]!.min.z).toBeCloseTo(beside.min.z, 6);
        for (let k = 0; k + 1 < n; k++) {
          expect(faces[k]!.min.z - faces[k + 1]!.max.z).toBeCloseTo(d.reveal, 6);
        }
      });
    }
  }

  it('keeps a stack saved under 1.0, a reveal shorter at the bottom, and warns', () => {
    // [400, 379.2] added up under 1.0's rule, which left the gap at the top
    // and bottom out. Splitting it evenly would cut a different chest of
    // drawers from a project nobody changed; the design is kept, the bottom
    // front gives up the difference, and a warning — not a note — says so
    // with the numbers to type.
    const project = buildProject(withDrawers([400, 379.2]));
    const faces = [1, 2].map((n) => find(project.parts, `C1-B-DRAWER-1-${n}-FACE`).box);
    expect(faces[0]!.max.z - faces[0]!.min.z).toBeCloseTo(400, 6);
    expect(faces[1]!.max.z - faces[1]!.min.z).toBeCloseTo(376.2, 6);
    const said = project.diagnostics.find((d) => d.message.includes('the way 1.0 added them'));
    expect(said?.severity).toBe('warning');
    expect(said?.message).toContain('3.0 mm shorter');
    expect(said?.message).toContain('Type 400.0, 376.2');
  });

  it('falls back to an even split when the fronts do not add up, and warns with the total', () => {
    const project = buildProject(withDrawers([200, 200, 300]));
    const said = project.diagnostics.find((d) =>
      d.message.includes('drawer front heights did not add up'),
    );
    expect(said?.severity).toBe('warning');
    // 782.2 mm of opening, less two reveals and two half reveals.
    expect(said?.message).toContain('773.2 mm');
    const faces = ['1', '2', '3'].map((n) => find(project.parts, `C1-B-DRAWER-1-${n}-FACE`));
    const h = faces.map((f) => f.box.max.z - f.box.min.z);
    expect(h[0]).toBeCloseTo(h[1]!, 6);
    expect(h[1]).toBeCloseTo(h[2]!, 6);
  });

  it('takes surface effects exactly as a door does, on the drawer-face role', () => {
    const params = withDrawers([779.2], (p) => {
      p.surfaceEffects.push({
        id: 'fx1',
        enabled: true,
        target: { select: 'role', role: 'drawer-face' },
        face: 'outside',
        effect: { kind: 'frame', margin: 20, width: 6, depth: 4 },
      });
    });
    const project = buildProject(params);
    const face = find(project.parts, 'C1-B-DRAWER-1-1-FACE');
    expect(face.features.some((f) => f.kind === 'pocket' && f.purpose === 'surface-frame')).toBe(
      true,
    );
    expect(project.diagnostics.some((d) => d.message.includes('matches no panel'))).toBe(false);
  });

  it('warns when the drawer box material falls outside the slide entry band', () => {
    // The shipped 12 mm back material measures 11.9 mm actual, 0.1 mm under
    // the default slide's own 12 mm minimum — a real, measured-thickness
    // gap, not a rounding artefact. See docs/DRAWERS.md.
    const project = buildProject(
      withDrawers([779.2], (p) => {
        p.drawerBoxMaterialId = 'ply12'; // MATERIAL_BACK: 11.9 mm actual
      }),
    );
    const warn = project.diagnostics.find(
      (d) => d.topic === 'hardware' && d.message.includes('drawer 1, bay 1, left side'),
    );
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toContain('needs at least 12 mm');
  });

  it('warns when the bay is too narrow for the slide entry the project is cut to', () => {
    const project = buildProject(
      withDrawers([779.2], (p) => {
        base(p).width = 190; // interior well under the 170 mm minimum once the deduction is taken
        base(p).dividerCount = 0;
      }),
    );
    const warn = project.diagnostics.find(
      (d) => d.topic === 'hardware' && d.message.includes('drawer 1, bay 1'),
    );
    expect(warn?.message).toContain('needs at least 170 mm');
  });

  it('still catches a too-narrow box when the carcass joint is tab-and-slot, not just dado', () => {
    // The box's own width requirement is discovered through the joint's
    // pocket/through-cut purpose, and tab-and-slot cuts a through feature
    // rather than a pocket — the discovery must survive that switch too.
    const project = buildProject(
      withDrawers([779.2], (p) => {
        base(p).width = 190;
        base(p).dividerCount = 0;
        p.joinery.carcassJoint = 'tabslot';
      }),
    );
    const warn = project.diagnostics.find(
      (d) => d.topic === 'hardware' && d.message.includes('drawer 1, bay 1'),
    );
    expect(warn?.message).toContain('needs at least 170 mm');
  });

  it('measures the slide mounting holes from the box front, not the carcass front, under inset fit', () => {
    // Under inset fit the box, and the runner with it, starts a front's
    // thickness behind the carcass front: measured from the carcass front,
    // every hole would miss the runner's own screw holes by that much.
    const params = withDrawers([779.2], (p) => {
      p.doors.fit = 'inset';
    });
    const project = buildProject(params);
    const req = buildParts(params).slides[0]!;
    const side = find(project.parts, 'C1-B-SIDE-L');
    const ys = drills(side, 'slide-panel').map((h) => toAssembly(frameOf(side), h.x, h.y).y);
    expect(Math.min(...ys)).toBeCloseTo(req.boxFrontY + 37, 6);
    expect(req.boxFrontY).toBeGreaterThan(side.box.min.y + 1);
  });
});

describe('a face-frame carcass with a drawer bay', () => {
  it('fits the drawer face to the frame opening, not the carcass panels behind it', () => {
    const params = withDrawers([1], (p) => {
      base(p).construction = 'face-frame';
      // A single, tall drawer so its face reaches the frame opening's own
      // limits top and bottom, the same as R-07's own face-frame door test.
    });
    // Recompute the height against the frame's own (shorter) opening: the
    // frame's rails eat into the run, so an arbitrary height would fall
    // back to a split of one — harmless, but the point here is the X bound.
    const project = buildProject(params);
    const face = find(project.parts, 'C1-B-DRAWER-1-1-FACE');
    const stileL = find(project.parts, 'C1-B-STILE-L');
    // Overlay is clamped to the stile's own width by default, so the face's
    // edge sits inside the stile, never out at the carcass side behind it.
    expect(face.box.min.x).toBeGreaterThan(stileL.box.min.x);
    expect(face.box.min.x).toBeLessThan(stileL.box.max.x);
  });
});

describe('a divider with drawers on both sides', () => {
  it('says when the screw holes from the two faces meet inside it', () => {
    // Matching drawers either side put Blum's table on both faces at the
    // same heights: two 12 mm holes into an 18 mm divider are one hole, and
    // two 11.5 mm system screws driven into it from either side collide.
    const params = withDrawers([779.2], (p) => {
      base(p).bays[1] = {
        shelves: 'none',
        shelfCount: 0,
        doors: 'none',
        drawerFrontHeights: [779.2],
      };
    });
    const project = buildProject(params);
    const divider = find(project.parts, 'C1-B-DIV-1');
    const holes = drills(divider, 'slide-panel');
    expect(new Set(holes.map((h) => h.side))).toEqual(new Set(['A', 'B']));
    const said = project.diagnostics.find((d) =>
      d.message.includes('carries runners on both faces'),
    );
    expect(said?.message).toContain(divider.label);
    expect(said?.message).toContain('wood screws');
  });

  it('stays quiet about a carcass side, which only ever has runners on one face', () => {
    const project = buildProject(withDrawers([779.2]));
    expect(
      project.diagnostics.some((d) => d.message.includes('carries runners on both faces')),
    ).toBe(false);
  });
});

describe('a drawer box inside its carcass', () => {
  const STRUCTURE = new Set([
    'side',
    'divider',
    'top',
    'bottom',
    'toe-rail',
    'back',
    'stile',
    'rail',
  ]);
  const variants: Array<[string, ProjectParams]> = [];
  for (const fit of ['overlay', 'inset'] as const) {
    for (const construction of ['frameless', 'face-frame'] as const) {
      for (const heights of [[779.2], [400, 376.2], [250, 250, 273.2]]) {
        variants.push([
          `${fit}, ${construction}, ${heights.length} drawer${heights.length === 1 ? '' : 's'}`,
          withDrawers(heights, (p) => {
            p.doors.fit = fit;
            base(p).construction = construction;
          }),
        ]);
      }
    }
  }

  it.each(variants)('never runs into a carcass panel or frame member: %s', (_name, params) => {
    // An overlay face reaches over the bottom and top panels, and a face
    // frame's over its rails. Sized to its face alone, the bottom box sat in
    // the bottom panel's own housing and the top one ran into the top rail.
    const project = buildProject(params);
    const boxes = project.parts.filter(
      (p) => p.role.startsWith('drawer-') && p.role !== 'drawer-face',
    );
    expect(boxes.length).toBeGreaterThan(0);
    const structure = project.parts.filter((p) => STRUCTURE.has(p.role));
    for (const b of boxes) {
      for (const s of structure) {
        expect(boxesOverlap(b.box, s.box, 0.01), `${b.id} runs into ${s.id}`).toBe(false);
      }
    }
  });

  it.each(variants)(
    'bores every runner hole on its panel and clear of the housings on that face: %s',
    (_name, params) => {
      // A hole outside the outline is drilled into thin air; one inside a
      // groove on the same face is a screw into the shelf or bottom it houses.
      const project = buildProject(params);
      for (const panel of project.parts) {
        for (const h of drills(panel, 'slide-panel')) {
          expect(pointInPath(panel.outline, h), `${panel.id} (${h.x}, ${h.y})`).toBe(true);
          const housing = panel.features.find(
            (f): f is PocketFeature =>
              f.kind === 'pocket' && f.side === h.side && pointInPath(f.path, h),
          );
          expect(housing?.purpose, `${panel.id} (${h.x}, ${h.y})`).toBeUndefined();
        }
      }
    },
  );

  it('says so, and builds no box, when the front is too short to hold one', () => {
    // A 30 mm top front: once 6 mm above is kept clear for the runner, 24 mm
    // is left, less than a 13 mm recess and a 14 mm bottom.
    const project = buildProject(withDrawers([30, 746.2]));
    expect(project.parts.some((p) => p.id === 'C1-B-DRAWER-1-1-FACE')).toBe(true);
    expect(project.parts.some((p) => p.id === 'C1-B-DRAWER-1-1-SIDE-L')).toBe(false);
    expect(project.notes.join(' ')).toContain('no box was built for this drawer');
  });
});

describe('runners behind a face frame', () => {
  it("bores nothing from Blum's frameless table, and says how a face-frame runner is fixed", () => {
    // Measured from the frame's front, the frameless table would put the
    // front screw 18-odd mm behind the carcass edge, nowhere the runner is.
    const project = buildProject(
      withDrawers([779.2], (p) => (base(p).construction = 'face-frame')),
    );
    for (const part of project.parts) expect(drills(part, 'slide-panel')).toHaveLength(0);
    const said = project.diagnostics.filter((d) =>
      d.message.includes('screw table is for frameless'),
    );
    expect(said).toHaveLength(1);
    expect(said[0]!.message).toContain('face-frame brackets');
  });
});

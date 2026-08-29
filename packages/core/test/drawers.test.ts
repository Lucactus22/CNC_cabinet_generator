import { describe, expect, it } from 'vitest';
import { base } from './carcasses.js';
import {
  bboxOf,
  buildProject,
  defaultParams,
  SLIDE_BLUM_TANDEM_F,
  SLIDE_BLUM_TANDEM_H,
  type DrillFeature,
  type Part,
  type ProjectParams,
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
    sheetLength: 2440,
    sheetWidth: 1220,
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
    const params = withDrawers([782.2]);
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
    const params = withDrawers([782.2], (p) => {
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
    const thin = buildProject(withDrawers([782.2]));
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
      withDrawers([782.2], (p) => {
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
    const project = buildProject(withDrawers([782.2]));
    for (const id of ['C1-B-DRAWER-1-1-SIDE-L', 'C1-B-DRAWER-1-1-SIDE-R']) {
      expect(find(project.parts, id).thickness).toBe(14);
    }
  });

  it('picks the largest nominal runner length that fits the carcass depth', () => {
    const project = buildProject(withDrawers([782.2]));
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
    const project = buildProject(withDrawers([782.2]));
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
      withDrawers([782.2], (p) => {
        p.materials.find((m) => m.id === MATERIAL_STOCK14)!.actualThickness = 18;
        p.hardware.slideId = SLIDE_BLUM_TANDEM_F.id;
      }),
    );
    const back = find(project.parts, 'C1-B-DRAWER-1-1-BACK');
    const bottom = find(project.parts, 'C1-B-DRAWER-1-1-BOTTOM');
    expect(back.box.min.z).toBeGreaterThanOrEqual(bottom.box.max.z - 1e-6);
  });

  it("notches both rear corners of the bottom for the slide's locking device", () => {
    const project = buildProject(withDrawers([782.2]));
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

  it('bores slide mounting holes on both box sides and both bay-bounding cabinet panels', () => {
    const project = buildProject(withDrawers([782.2]));
    for (const id of ['C1-B-DRAWER-1-1-SIDE-L', 'C1-B-DRAWER-1-1-SIDE-R']) {
      expect(drills(find(project.parts, id), 'slide-side')).toHaveLength(2);
    }
    // Bay 1 is bounded by the left side and the divider.
    expect(drills(find(project.parts, 'C1-B-SIDE-L'), 'slide-panel')).toHaveLength(2);
    expect(drills(find(project.parts, 'C1-B-DIV-1'), 'slide-panel')).toHaveLength(2);
  });

  it('lines up drawer faces with a reveal, the same as neighbouring doors', () => {
    const project = buildProject(
      withDrawers([400, 379.2]), // sums with one reveal to the 782.2 mm opening
    );
    expect(project.notes.join(' ')).not.toContain('did not add up');
    const top = find(project.parts, 'C1-B-DRAWER-1-1-FACE');
    const bottom = find(project.parts, 'C1-B-DRAWER-1-2-FACE');
    expect(top.box.min.z - bottom.box.max.z).toBeCloseTo(project.params.doors.reveal, 6);
  });

  it('falls back to an even split when the front heights do not add up to the opening', () => {
    const project = buildProject(withDrawers([200, 200, 300]));
    expect(project.notes.join(' ')).toContain('did not add up');
    const faces = ['1', '2', '3'].map((n) => find(project.parts, `C1-B-DRAWER-1-${n}-FACE`));
    const h = faces.map((f) => f.box.max.z - f.box.min.z);
    expect(h[0]).toBeCloseTo(h[1]!, 6);
    expect(h[1]).toBeCloseTo(h[2]!, 6);
  });

  it('takes surface effects exactly as a door does, on the drawer-face role', () => {
    const params = withDrawers([782.2], (p) => {
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
      withDrawers([782.2], (p) => {
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
      withDrawers([782.2], (p) => {
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
      withDrawers([782.2], (p) => {
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
    // Under inset fit the box starts a door-thickness behind the carcass
    // front; a hole measured from the carcass front instead would land
    // outside the box side's own machined outline.
    const project = buildProject(
      withDrawers([782.2], (p) => {
        p.doors.fit = 'inset';
      }),
    );
    const side = find(project.parts, 'C1-B-DRAWER-1-1-SIDE-L');
    const bb = bboxOf(side.outline);
    const holes = drills(side, 'slide-side');
    expect(holes.length).toBeGreaterThan(0);
    for (const hole of holes) {
      expect(hole.x).toBeGreaterThanOrEqual(bb.minX - 1e-6);
      expect(hole.x).toBeLessThanOrEqual(bb.maxX + 1e-6);
      expect(hole.y).toBeGreaterThanOrEqual(bb.minY - 1e-6);
      expect(hole.y).toBeLessThanOrEqual(bb.maxY + 1e-6);
    }
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

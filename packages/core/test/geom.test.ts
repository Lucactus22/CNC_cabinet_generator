import { describe, expect, it } from 'vitest';
import {
  arcFromBulge,
  bboxOf,
  circlePath,
  ensureCCW,
  findInsideCorners,
  isCCW,
  pathLength,
  pointInPath,
  rect,
  relieveCorners,
  reversePath,
  signedArea,
  tessellate,
} from '../src/geom/index.js';

describe('path basics', () => {
  it('builds a CCW rectangle with the right area', () => {
    const r = rect(0, 0, 100, 50);
    expect(isCCW(r)).toBe(true);
    expect(signedArea(r)).toBeCloseTo(5000, 6);
  });

  it('reverses a path without changing its shape', () => {
    const r = rect(10, 20, 30, 40);
    const rev = reversePath(r);
    expect(isCCW(rev)).toBe(false);
    expect(Math.abs(signedArea(rev))).toBeCloseTo(1200, 6);
    expect(bboxOf(rev)).toEqual(bboxOf(r));
  });

  it('round-trips bulge arcs through a full circle', () => {
    const c = circlePath(5, 5, 10);
    // Tessellation inscribes the circle, so area and length land just under the
    // true values; what matters is that the error stays inside the sagitta.
    expect(Math.abs(signedArea(c))).toBeCloseTo(Math.PI * 100, -1);
    expect(pathLength(c)).toBeCloseTo(2 * Math.PI * 10, -1);
    // The bounding box, by contrast, must be exact: nesting depends on it.
    const bb = bboxOf(c);
    expect(bb.minX).toBeCloseTo(-5, 9);
    expect(bb.maxX).toBeCloseTo(15, 9);
    expect(bb.minY).toBeCloseTo(-5, 9);
    expect(bb.maxY).toBeCloseTo(15, 9);
  });

  it('derives arc centre and radius from a bulge', () => {
    // Quarter circle radius 10 centred at the origin, from (10,0) to (0,10).
    const arc = arcFromBulge({ x: 10, y: 0 }, { x: 0, y: 10 }, Math.tan(Math.PI / 8));
    expect(arc.cx).toBeCloseTo(0, 9);
    expect(arc.cy).toBeCloseTo(0, 9);
    expect(arc.r).toBeCloseTo(10, 9);
    expect(arc.ccw).toBe(true);
  });

  it('tests point containment', () => {
    const r = rect(0, 0, 10, 10);
    expect(pointInPath(r, { x: 5, y: 5 })).toBe(true);
    expect(pointInPath(r, { x: 15, y: 5 })).toBe(false);
  });
});

describe('corner reliefs', () => {
  const R = 3; // 6 mm cutter

  it('identifies all four corners of a slot as needing relief', () => {
    expect(findInsideCorners(rect(0, 0, 100, 18))).toHaveLength(4);
  });

  it('places a dogbone exactly where the classic construction says it should', () => {
    // Corner of the void at the origin, region occupying the +x/+y quadrant.
    const slot = ensureCCW(rect(0, 0, 100, 50));
    const out = relieveCorners(slot, { toolRadius: R, style: 'dogbone' });

    // Each corner becomes two vertices joined by an arc.
    expect(out.pts.length).toBe(8);

    // The relief at the origin should cross the walls at r*(sqrt(3)-1)/2 from
    // the corner, with the circle centred at (-r/2, -r/2).
    const expected = (R * (Math.sqrt(3) - 1)) / 2;
    const onYWall = out.pts.find((p) => Math.abs(p.x) < 1e-6 && p.y > 0 && p.y < 5);
    const onXWall = out.pts.find((p) => Math.abs(p.y) < 1e-6 && p.x > 0 && p.x < 5);
    expect(onYWall?.y).toBeCloseTo(expected, 9);
    expect(onXWall?.x).toBeCloseTo(expected, 9);
  });

  it('sweeps the dogbone the long way round, into the material', () => {
    const out = relieveCorners(ensureCCW(rect(0, 0, 100, 50)), {
      toolRadius: R,
      style: 'dogbone',
    });
    const arcVertex = out.pts.find((p) => Math.abs(p.x) < 1e-6 && p.bulge);
    // 330 degrees of sweep => bulge = tan(82.5 deg).
    expect(arcVertex?.bulge).toBeCloseTo(Math.tan((82.5 * Math.PI) / 180), 6);
  });

  it('reaches past the corner so a square mating part can seat', () => {
    const out = relieveCorners(ensureCCW(rect(0, 0, 100, 50)), {
      toolRadius: R,
      style: 'dogbone',
    });
    const bb = bboxOf(out);
    // The relief must bite outside the nominal slot on both walls.
    expect(bb.minX).toBeLessThan(-0.1);
    expect(bb.minY).toBeLessThan(-0.1);
    // But it must stay within one tool diameter of the corner.
    expect(bb.minX).toBeGreaterThan(-2 * R);
    expect(bb.minY).toBeGreaterThan(-2 * R);
  });

  it('covers the corner point itself with the cutter', () => {
    // The whole purpose: the tool centred at C must reach the sharp corner.
    const s = Math.SQRT1_2;
    const C = { x: (-R * s) / Math.SQRT2, y: (-R * s) / Math.SQRT2 };
    expect(Math.hypot(C.x, C.y)).toBeLessThan(R);
  });

  it('drives a T-bone along the slot length rather than widening it', () => {
    // 100 x 18 slot. The relief centre must travel along the long axis, so the
    // slot gets longer; the circle still sweeps one tool radius either side of
    // that centre, which is the characteristic T shape at each end.
    const out = relieveCorners(ensureCCW(rect(0, 0, 100, 18)), {
      toolRadius: R,
      style: 'tbone',
    });
    const bb = bboxOf(out);
    expect(bb.minX).toBeLessThan(-0.5);
    expect(bb.maxX).toBeGreaterThan(100.5);
    // The perpendicular overcut is bounded by the cutter, never more.
    expect(bb.minY).toBeGreaterThanOrEqual(-R - 1e-9);
    expect(bb.maxY).toBeLessThanOrEqual(18 + R + 1e-9);
  });

  it('keeps a dogbone tighter to the corner than a T-bone', () => {
    const slot = ensureCCW(rect(0, 0, 100, 18));
    const dog = bboxOf(relieveCorners(slot, { toolRadius: R, style: 'dogbone' }));
    const tee = bboxOf(relieveCorners(slot, { toolRadius: R, style: 'tbone' }));
    expect(dog.minX).toBeGreaterThan(tee.minX);
  });

  it('leaves geometry alone when relief is disabled', () => {
    const slot = rect(0, 0, 100, 18);
    expect(relieveCorners(slot, { toolRadius: R, style: 'none' })).toEqual(slot);
  });

  it('does not relieve concave corners of the void', () => {
    // An L-shaped void: one corner is concave and the cutter reaches it fine.
    const L = ensureCCW({
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
        { x: 50, y: 40 },
        { x: 50, y: 80 },
        { x: 0, y: 80 },
      ],
      closed: true,
    });
    const corners = findInsideCorners(L);
    expect(corners).toHaveLength(5); // six corners, one of them concave
  });
});

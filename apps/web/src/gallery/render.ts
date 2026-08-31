import {
  cross3,
  dot3,
  frameOf,
  tessellate,
  type Axis,
  type Part,
  type ProjectResult,
  type Vec2,
  type Vec3,
} from '@cabgen/core';

/**
 * Drawing the real geometry, small.
 *
 * Every picture in the option galleries comes out of here, and out of a
 * project the real pipeline built (see `samples.ts`). Nothing is hand-drawn:
 * a stopped-dado thumbnail is literally a stopped dado as this tool cuts it,
 * notch, stop, relief and all. An icon would drift the first time the joinery
 * changed, and R-01 through R-08 changed it repeatedly.
 *
 * Output is plain SVG path data in millimetres, so it is a pure function of a
 * `ProjectResult` — cacheable, testable in node, and free of any second
 * rendering path that could disagree with the model.
 */

export interface Shape {
  /** SVG path data, in millimetres, already projected. */
  d: string;
  fill?: string;
  stroke?: string;
  /** Stroke width in millimetres, so it scales with the drawing. */
  width?: number;
}

export interface Drawing {
  shapes: Shape[];
  /** `minX minY width height`, in millimetres. */
  viewBox: string;
  /** Longest side, for callers that want to size a stroke against it. */
  span: number;
  /**
   * The blank's own boundary, when the drawing must not spill past it.
   *
   * A relieved slot at the edge of a panel pokes a few millimetres beyond the
   * outline — the cutter really does run off into air there — and a lobe drawn
   * outside the blank reads as material that is not there.
   */
  clip?: string;
}

/**
 * Keeping only part of a drawing.
 *
 * A capped top and an inset one differ by one panel thickness at one corner.
 * Whole-cabinet thumbnails put that difference under a pixel, so the view says
 * which corner it is about and the drawing is cropped to it — the same
 * geometry, closer.
 */
export type CropAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'centre'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface Crop {
  at: CropAnchor;
  /** Fraction of the drawing kept, in both directions. */
  size: number;
}

/** Looking at the assembled unit from the front, right and above. */
export interface IsoView {
  kind: 'iso';
  crop?: Crop;
  /** Degrees swung to the right of square-on. */
  azimuth?: number;
  /** Degrees lifted above the horizon. */
  elevation?: number;
}

/**
 * A plane cut through the assembly, perpendicular to one axis.
 *
 * This is the view a capped top and an inset one differ in at all: capping
 * exists precisely so the seam does not show from outside, so a picture from
 * outside shows nothing. Leave `at` off and the plane goes wherever it crosses
 * the most machining — which keeps the picture honest after a joinery change
 * rather than pointing at a coordinate that used to hold a dado.
 */
export interface SectionView {
  kind: 'section';
  axis: Axis;
  at?: number;
  crop?: Crop;
}

/** One flat blank in its machining coordinates, optionally zoomed to a detail. */
export interface DetailView {
  kind: 'detail';
  /** Which blank. Default: whichever carries the most pockets. */
  pick?: (part: Part) => boolean;
  /** Millimetres across the window, centred on the first pocket's corner. Omitted shows the whole blank. */
  window?: number;
}

export type View = IsoView | SectionView | DetailView;

/**
 * Tones taken from the 3D view's palette, so a thumbnail and the model on the
 * bench read as the same object rather than two drawings of it.
 */
const INK = {
  lit: '#e8cba2',
  shade: '#8a6f4e',
  edge: '#3a3128',
  /** Material the section plane passes through. */
  cut: '#d9a668',
  /** What stands behind the plane: line only, so the cut reads first. */
  behind: '#7d7466',
  feature: '#5b452a',
  pocket: '#8b6c45',
  /** Right through the blank: no material at all. */
  void: '#20242b',
};

const RIM = 0.9;
const HAIR = 0.5;

export function draw(project: ProjectResult, view: View): Drawing {
  if (view.kind === 'detail') return drawDetail(project, view);
  const drawing = view.kind === 'iso' ? drawIso(project, view) : drawSection(project, view);
  return view.crop ? cropped(drawing, view.crop) : drawing;
}

function cropped(drawing: Drawing, crop: Crop): Drawing {
  const [x0, y0, w, h] = drawing.viewBox.split(' ').map(Number) as [number, number, number, number];
  const k = Math.max(0.05, Math.min(1, crop.size));
  const nw = w * k;
  const nh = h * k;
  const left = crop.at.endsWith('left') ? 0 : crop.at.endsWith('right') ? w - nw : (w - nw) / 2;
  const top = crop.at.startsWith('top') ? 0 : crop.at.startsWith('bottom') ? h - nh : (h - nh) / 2;
  return {
    shapes: drawing.shapes,
    viewBox: `${round(x0 + left)} ${round(y0 + top)} ${round(nw)} ${round(nh)}`,
    span: Math.max(nw, nh),
  };
}

// --------------------------------------------------------------- projection

interface Basis {
  right: Vec3;
  up: Vec3;
  /** Unit vector from the scene towards the eye. */
  toward: Vec3;
}

const project = (b: Basis, p: Vec3): Vec2 => ({ x: dot3(p, b.right), y: -dot3(p, b.up) });

const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

const AXIS_VEC: Record<Axis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

/**
 * Front, right and above by default.
 *
 * Assembly space is X across, Y into the room's depth and Z up, so a camera
 * in front of the run sits at negative Y.
 */
function isoBasis(azimuthDeg = 32, elevationDeg = 24): Basis {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  const toward = norm3({
    x: Math.sin(a) * Math.cos(e),
    y: -Math.cos(a) * Math.cos(e),
    z: Math.sin(e),
  });
  const right = norm3(cross3(AXIS_VEC.z, toward));
  return { right, up: cross3(toward, right), toward };
}

/**
 * Where you stand to look at a section: from the left for a cut across the
 * width, from the front for a cut across the depth, from above for a plan.
 */
function sectionBasis(axis: Axis): { basis: Basis; forward: Vec3 } {
  const forward: Vec3 = axis === 'z' ? { x: 0, y: 0, z: -1 } : AXIS_VEC[axis];
  const up: Vec3 = axis === 'z' ? AXIS_VEC.y : AXIS_VEC.z;
  const right = cross3(forward, up);
  return {
    basis: { right, up, toward: { x: -forward.x, y: -forward.y, z: -forward.z } },
    forward,
  };
}

// -------------------------------------------------------------------- iso

interface Facet {
  pts: Vec2[][];
  depth: number;
  fill?: string;
  stroke?: string;
  width?: number;
}

const LIGHT = norm3({ x: 0.45, y: -0.75, z: 0.55 });

function drawIso(project_: ProjectResult, view: IsoView): Drawing {
  const b = isoBasis(view.azimuth, view.elevation);
  const facets: Facet[] = [];

  for (const part of project_.parts) {
    const f = frameOf(part);
    const ring = ccwRing(tessellate(part.outline, 0.6));
    if (ring.length < 3) continue;
    const t = part.thickness;
    const at = (p: Vec2, w: number): Vec3 => lift(f, p.x, p.y, w);

    // Holes are subtracted from the caps with the even-odd rule rather than
    // drawn over: a slot filled in is a tab-and-slot joint that looks like a
    // dado one, which is the exact distinction this gallery exists to show.
    const holes = part.features
      .filter((feat) => feat.kind === 'through')
      .map((feat) => tessellate(feat.path, 0.6));

    for (const [normal, w, order] of [
      [f.n, 0, ring],
      [neg(f.n), -t, [...ring].reverse()],
    ] as Array<[Vec3, number, Vec2[]]>) {
      if (dot3(normal, b.toward) <= 0.02) continue;
      const loops = [order, ...holes].map((loop) => loop.map((p) => project(b, at(p, w))));
      facets.push({
        pts: loops,
        depth: depthOf(
          b,
          order.map((p) => at(p, w)),
        ),
        fill: tone(normal),
        stroke: INK.edge,
        width: HAIR,
      });
    }

    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const edge = { x: q.x - p.x, y: q.y - p.y };
      const outward = norm3(add3(scale3(f.u, edge.y), scale3(f.v, -edge.x)));
      if (dot3(outward, b.toward) <= 0.02) continue;
      const quad = [at(p, 0), at(q, 0), at(q, -t), at(p, -t)];
      facets.push({
        pts: [quad.map((v3) => project(b, v3))],
        depth: depthOf(b, quad),
        fill: tone(outward),
        stroke: INK.edge,
        width: HAIR,
      });
    }

    for (const feat of part.features) {
      if (feat.kind === 'engrave' || feat.kind === 'through') continue;
      const side = feat.side;
      const normal = side === 'A' ? f.n : neg(f.n);
      if (dot3(normal, b.toward) <= 0.02) continue;
      const loop =
        feat.kind === 'pocket'
          ? tessellate(feat.path, 0.4)
          : circle(feat.x, feat.y, feat.diameter / 2);
      if (loop.length < 3) continue;
      const w = side === 'A' ? 0 : -part.thickness;
      // A hair towards the eye, or the face it belongs to z-fights with it.
      const pts = loop.map((p) => project(b, add3(at(p, w), scale3(b.toward, 0.6))));
      facets.push({
        pts: [pts],
        depth:
          depthOf(
            b,
            loop.map((p) => at(p, w)),
          ) + 0.6,
        fill: 'none',
        stroke: INK.feature,
        width: HAIR,
      });
    }
  }

  return compose(facets);
}

/** Lambert against a key light in roughly the same place as the 3D view's. */
function tone(normal: Vec3): string {
  return mix(INK.shade, INK.lit, 0.42 + 0.58 * Math.max(0, dot3(normal, LIGHT)));
}

// ---------------------------------------------------------------- section

type Interval = [number, number];
const SLIVER = 1e-6;

function drawSection(result: ProjectResult, view: SectionView): Drawing {
  const axis = view.axis;
  const { basis, forward } = sectionBasis(axis);
  const a = AXIS_VEC[axis];
  const at = view.at ?? bestSectionAt(result, axis);
  const cutDepth = dot3(scale3(a, at), forward);

  const facets: Facet[] = [];

  for (const part of result.parts) {
    const f = frameOf(part);
    const an = dot3(f.n, a);
    const centre = {
      x: (part.box.min.x + part.box.max.x) / 2,
      y: (part.box.min.y + part.box.max.y) / 2,
      z: (part.box.min.z + part.box.max.z) / 2,
    };

    if (Math.abs(an) > 0.5) {
      // Parallel to the plane, so there is nothing to cut. Drawn as a line
      // only when it stands behind the cut; anything in front of it would be
      // between the viewer and the section.
      if (dot3(centre, forward) <= cutDepth + 0.5) continue;
      const ring = tessellate(part.outline, 0.8).map((p) => project(basis, lift(f, p.x, p.y, 0)));
      facets.push({ pts: [ring], depth: -1e6, fill: 'none', stroke: INK.behind, width: HAIR });
      continue;
    }

    const cut = cutPart(part, f, a, at);
    if (cut.length === 0) {
      if (dot3(centre, forward) <= cutDepth + 0.5) continue;
      const ring = tessellate(part.outline, 0.8).map((p) => project(basis, lift(f, p.x, p.y, 0)));
      facets.push({ pts: [ring], depth: -1e6, fill: 'none', stroke: INK.behind, width: HAIR });
      continue;
    }
    for (const quad of cut) {
      facets.push({
        pts: [quad.map((p) => project(basis, p))],
        depth: 0,
        fill: INK.cut,
        stroke: INK.edge,
        width: RIM,
      });
    }
  }

  return compose(facets);
}

/**
 * The material one panel leaves in a plane across an assembly axis, as a list
 * of quads in assembly space.
 *
 * Exported for the tests: the whole point of a cutaway is that it shows the
 * joint, and "it drew something" is not the same as "the groove is in it".
 */
export function sectionQuads(part: Part, axis: Axis, at: number): Vec3[][] {
  return cutPart(part, frameOf(part), AXIS_VEC[axis], at);
}

/**
 * The material one panel leaves in the plane, pockets and holes taken out of
 * it.
 *
 * Every panel this generator makes is a prism: an outline extruded from the
 * machined face back through its own thickness, with pockets eating into it
 * from either face. Because the frames are axis-aligned, a plane across one
 * assembly axis reduces to a line across the flat blank — so the cut is a run
 * of intervals along that line, each with whatever thickness the machining
 * left. That is what puts a groove, a tab and a hinge cup into the picture
 * instead of a plain rectangle.
 */
function cutPart(part: Part, f: ReturnType<typeof frameOf>, a: Vec3, at: number): Vec3[][] {
  const au = dot3(f.u, a);
  const av = dot3(f.v, a);
  const originA = dot3(f.origin, a);
  const alongY = Math.abs(au) > 0.5;
  const denom = alongY ? au : av;
  if (Math.abs(denom) < 0.5) return [];
  const fixed = (at - originA) / denom;

  const ring = tessellate(part.outline, 0.4);
  const solid = spansAt(ring, fixed, alongY);
  if (solid.length === 0) return [];

  const t = part.thickness;
  const removals: Array<{ span: Interval; w: Interval }> = [];
  for (const feat of part.features) {
    if (feat.kind === 'engrave') continue;
    if (feat.kind === 'drill') {
      const r = feat.diameter / 2;
      const off = fixed - (alongY ? feat.x : feat.y);
      if (Math.abs(off) >= r) continue;
      const half = Math.sqrt(r * r - off * off);
      const mid = alongY ? feat.y : feat.x;
      removals.push({
        span: [mid - half, mid + half],
        w: feat.depth === 'thru' ? [-t, 0] : blind(feat.side, feat.depth, t),
      });
      continue;
    }
    const spans = spansAt(tessellate(feat.path, 0.4), fixed, alongY);
    const w: Interval = feat.kind === 'through' ? [-t, 0] : blind(feat.side, feat.depth, t);
    for (const span of spans) removals.push({ span, w });
  }

  const marks = new Set<number>();
  for (const [p, q] of solid) {
    marks.add(p);
    marks.add(q);
  }
  for (const r of removals) {
    marks.add(r.span[0]);
    marks.add(r.span[1]);
  }
  const sorted = [...marks].sort((p, q) => p - q);

  const quads: Vec3[][] = [];
  let run: { from: number; to: number; ws: Interval[] } | null = null;
  const flush = (): void => {
    const piece = run;
    run = null;
    if (!piece) return;
    for (const [w0, w1] of piece.ws) {
      quads.push(
        (
          [
            [piece.from, w0],
            [piece.to, w0],
            [piece.to, w1],
            [piece.from, w1],
          ] as Array<[number, number]>
        ).map(([free, w]) => (alongY ? lift(f, fixed, free, w) : lift(f, free, fixed, w))),
      );
    }
  };

  for (let i = 0; i + 1 < sorted.length; i++) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    if (to - from < SLIVER) continue;
    const mid = (from + to) / 2;
    if (!solid.some(([p, q]) => mid > p && mid < q)) {
      flush();
      continue;
    }
    let ws: Interval[] = [[-t, 0]];
    for (const r of removals) if (mid > r.span[0] && mid < r.span[1]) ws = subtract(ws, r.w);
    // Adjacent spans with the same profile are one piece of material; drawn
    // separately they would show a seam where the panel is in fact solid.
    if (run && Math.abs(run.to - from) < SLIVER && sameProfile(run.ws, ws)) {
      run.to = to;
    } else {
      flush();
      run = { from, to, ws };
    }
  }
  flush();
  return quads;
}

/** A blind pocket eats in from the face it is machined from. */
function blind(side: 'A' | 'B', depth: number, thickness: number): Interval {
  const d = Math.min(depth, thickness);
  return side === 'A' ? [-d, 0] : [-thickness, -thickness + d];
}

function spansAt(ring: Vec2[], fixed: number, alongY: boolean): Interval[] {
  const hits: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const pf = alongY ? p.x : p.y;
    const qf = alongY ? q.x : q.y;
    // Half-open, so a vertex sitting exactly on the line is counted once.
    if (pf <= fixed === qf <= fixed) continue;
    const k = (fixed - pf) / (qf - pf);
    const pv = alongY ? p.y : p.x;
    const qv = alongY ? q.y : q.x;
    hits.push(pv + k * (qv - pv));
  }
  hits.sort((p, q) => p - q);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i]!, hits[i + 1]!]);
  return out;
}

function subtract(from: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of from) {
    if (cut[1] <= a + SLIVER || cut[0] >= b - SLIVER) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] > a + SLIVER) out.push([a, cut[0]]);
    if (cut[1] < b - SLIVER) out.push([cut[1], b]);
  }
  return out;
}

const sameProfile = (a: Interval[], b: Interval[]): boolean =>
  a.length === b.length &&
  a.every((iv, i) => Math.abs(iv[0] - b[i]![0]) < SLIVER && Math.abs(iv[1] - b[i]![1]) < SLIVER);

/**
 * Where to cut, when the caller has not said.
 *
 * Scored by how much machining the plane actually crosses, rather than fixed
 * at a coordinate somebody measured once: a thumbnail whose plane misses every
 * dado after the joinery moved would be a picture that quietly stopped being
 * about the thing it labels.
 */
export function bestSectionAt(result: ProjectResult, axis: Axis): number {
  const a = AXIS_VEC[axis];
  const extents: Interval[] = [];
  const forbidden: Interval[] = [];
  let lo = Infinity;
  let hi = -Infinity;

  for (const part of result.parts) {
    const f = frameOf(part);
    lo = Math.min(lo, part.box.min[axis]);
    hi = Math.max(hi, part.box.max[axis]);
    const an = dot3(f.n, a);
    if (Math.abs(an) > 0.5) {
      const face = dot3(f.origin, a);
      const back = face - an * part.thickness;
      forbidden.push([Math.min(face, back), Math.max(face, back)]);
      continue;
    }
    for (const feat of part.features) {
      if (feat.kind === 'engrave') continue;
      const span =
        feat.kind === 'drill'
          ? localSpan(
              f,
              a,
              feat.x - feat.diameter / 2,
              feat.x + feat.diameter / 2,
              feat.y - feat.diameter / 2,
              feat.y + feat.diameter / 2,
            )
          : spanOfPath(f, a, tessellate(feat.path, 1));
      if (span) extents.push(span);
    }
  }

  const middle = Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  const candidates = [middle, ...extents.map(([p, q]) => (p + q) / 2)];
  let best = middle;
  let bestScore = -1;
  for (const c of candidates) {
    if (forbidden.some(([p, q]) => c > p + 0.2 && c < q - 0.2)) continue;
    const score = extents.filter(([p, q]) => c > p + SLIVER && c < q - SLIVER).length;
    if (
      score > bestScore ||
      (score === bestScore && Math.abs(c - middle) < Math.abs(best - middle))
    ) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function spanOfPath(f: ReturnType<typeof frameOf>, a: Vec3, pts: Vec2[]): Interval | null {
  if (pts.length === 0) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return localSpan(f, a, x0, x1, y0, y1);
}

function localSpan(
  f: ReturnType<typeof frameOf>,
  a: Vec3,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Interval {
  const o = dot3(f.origin, a);
  const au = dot3(f.u, a);
  const av = dot3(f.v, a);
  const ends = [o + au * x0 + av * y0, o + au * x1 + av * y1];
  return [Math.min(...ends), Math.max(...ends)];
}

// ----------------------------------------------------------------- detail

function drawDetail(result: ProjectResult, view: DetailView): Drawing {
  const parts = view.pick ? result.parts.filter(view.pick) : result.parts;
  const part =
    [...parts].sort((a, b) => machinedCount(b) - machinedCount(a))[0] ?? result.parts[0] ?? null;
  if (!part) return { shapes: [], viewBox: '0 0 1 1', span: 1 };

  const flat = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y });
  const shapes: Shape[] = [];

  const ring = tessellate(part.outline, 0.3).map(flat);
  shapes.push({ d: polyD(ring), fill: INK.lit, stroke: INK.edge, width: 0.6 });

  // Machining is painted on rather than punched out: a hole that reaches past
  // the blank's edge cannot be subtracted with the even-odd rule without
  // filling in the air outside, which is what the clip below is for.
  for (const feat of part.features) {
    if (feat.kind === 'engrave') continue;
    const loop =
      feat.kind === 'drill'
        ? circle(feat.x, feat.y, feat.diameter / 2)
        : tessellate(feat.path, 0.3);
    shapes.push({
      d: polyD(loop.map(flat)),
      fill: feat.kind === 'through' ? INK.void : INK.pocket,
      stroke: INK.edge,
      width: 0.35,
    });
  }

  const focus = focusOf(part);
  const clip = polyD(ring);
  const half = view.window !== undefined ? view.window / 2 : 0;
  if (half > 0) {
    return {
      shapes,
      viewBox: `${round(focus.x - half)} ${round(-focus.y - half)} ${round(2 * half)} ${round(2 * half)}`,
      span: 2 * half,
      clip,
    };
  }
  return { ...bounded(shapes, [ring]), clip };
}

/** Pockets and slots both put an inside corner on a blank, and both get relief. */
const machinedCount = (part: Part): number =>
  part.features.filter((f) => f.kind === 'pocket' || f.kind === 'through').length;

/**
 * What a detail is a detail *of*: a corner of the first groove or slot, which
 * is where corner relief lives and where a stopped groove ends.
 *
 * Of the four, the one nearest the middle of the blank — a slot that reaches
 * the panel's own edge has corners out in the air, and a window centred on one
 * of those is half background.
 */
function focusOf(part: Part): Vec2 {
  const cut = part.features.find((f) => f.kind === 'pocket' || f.kind === 'through');
  const centre = { x: part.width / 2, y: part.height / 2 };
  if (!cut || (cut.kind !== 'pocket' && cut.kind !== 'through')) return centre;
  const pts = tessellate(cut.path, 1);
  const xs = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
  const ys = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  let best = { x: xs[0]!, y: ys[0]! };
  let near = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const d = Math.hypot(x - centre.x, y - centre.y);
      if (d < near) {
        near = d;
        best = { x, y };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ shared

function compose(facets: Facet[]): Drawing {
  // Painter's algorithm over back-facing-culled prism faces. Panels are
  // convex boxes in a fixed view, so a centroid sort separates them cleanly
  // and costs nothing next to a depth buffer.
  const order = [...facets].sort((a, b) => a.depth - b.depth);
  const shapes: Shape[] = order.map((f) => ({
    d: f.pts.map(polyD).join(' '),
    fill: f.fill,
    stroke: f.stroke,
    width: f.width,
  }));
  return bounded(
    shapes,
    facets.flatMap((f) => f.pts),
  );
}

function bounded(shapes: Shape[], loops: Vec2[][]): Drawing {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const loop of loops) {
    for (const p of loop) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return { shapes, viewBox: '0 0 1 1', span: 1 };
  const pad = Math.max(2, Math.max(x1 - x0, y1 - y0) * 0.04);
  const w = x1 - x0 + 2 * pad;
  const h = y1 - y0 + 2 * pad;
  return {
    shapes,
    viewBox: `${round(x0 - pad)} ${round(y0 - pad)} ${round(w)} ${round(h)}`,
    span: Math.max(w, h),
  };
}

const polyD = (pts: Vec2[]): string =>
  pts.length === 0 ? '' : `M${pts.map((p) => `${round(p.x)} ${round(p.y)}`).join('L')}Z`;

const round = (n: number): number => Math.round(n * 100) / 100;

const lift = (f: ReturnType<typeof frameOf>, x: number, y: number, w: number): Vec3 => ({
  x: f.origin.x + f.u.x * x + f.v.x * y + f.n.x * w,
  y: f.origin.y + f.u.y * x + f.v.y * y + f.n.y * w,
  z: f.origin.z + f.u.z * x + f.v.z * y + f.n.z * w,
});

const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });
const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

const depthOf = (b: Basis, pts: Vec3[]): number =>
  pts.reduce((acc, p) => acc + dot3(p, b.toward), 0) / Math.max(1, pts.length);

/** Local (u, v) is right-handed against n, so a positive area is anticlockwise. */
function ccwRing(pts: Vec2[]): Vec2[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    area += p.x * q.y - q.x * p.y;
  }
  return area >= 0 ? pts : [...pts].reverse();
}

function circle(cx: number, cy: number, r: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function mix(from: string, to: string, k: number): string {
  const t = Math.max(0, Math.min(1, k));
  const a = hex(from);
  const b = hex(to);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const hex = (s: string): number[] => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

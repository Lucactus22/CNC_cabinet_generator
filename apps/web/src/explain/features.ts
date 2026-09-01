import {
  dot3,
  frameOf,
  tessellate,
  type Axis,
  type Feature,
  type Part,
  type ProjectResult,
  type Vec3,
} from '@cabgen/core';
import type { SectionView } from '../gallery/render';
import { topicForPurpose, type Topic } from './topics';

/**
 * Turning a piece of machining into a question that can be answered.
 *
 * Selecting a panel already tells you what it is. What it does not tell you is
 * why there is a groove across it, why the groove stops 10 mm short of the
 * front, or why there is a bite out of one corner of it — and those are the
 * things a first-time user is actually looking at. This maps the `purpose`
 * every feature already carries onto the topic that explains it, and works out
 * where to cut the *live* project so the explanation comes with a picture of
 * the user's own joint rather than a sample of somebody else's.
 */

export interface MachiningGroup {
  purpose: string;
  /** What to call it in a list, in the trade's words rather than the code's. */
  label: string;
  features: Feature[];
  topic?: Topic;
}

/**
 * Purposes as a woodworker would name them.
 *
 * A purpose with no entry still appears — under its own name — rather than
 * being hidden, because a joint nobody has written about is exactly the thing
 * somebody needs told about.
 */
const PURPOSE_LABEL: Record<string, string> = {
  carcass: 'Housing for a carcass panel',
  shelf: 'Housing for a shelf',
  divider: 'Housing for a divider',
  back: 'Groove for the back',
  'toe-rail': 'Housing for the toe kick rail',
  'hanging-rail': 'Housing for the hanging rail',
  'face-frame': 'Housing for the face frame',
  'face-frame-lap': 'Half lap',
  'drawer-box': 'Drawer box joint',
  'drawer-box-back': 'Housing for the drawer back',
  'drawer-box-bottom': 'Groove for the drawer bottom',
  screw: 'Screw clearance holes',
  'shelf-pin': 'Shelf pin ladder',
  'hinge-cup': 'Hinge cup',
  'hinge-dowel': 'Hinge dowel holes',
  'hinge-plate': 'Hinge plate holes',
  handle: 'Handle fixing holes',
  'slide-side': 'Slide holes, on the box',
  'slide-panel': 'Slide holes, in the cabinet',
  'wall-mount': 'Wall fixing holes',
  'surface-grooves': 'Grooved face',
  'surface-frame': 'Shaker line',
};

/** Everything machined into one blank, grouped by what put it there. */
export function machiningOf(part: Part): MachiningGroup[] {
  const groups = new Map<string, MachiningGroup>();
  for (const feature of part.features) {
    if (feature.kind === 'engrave') continue;
    const purpose = feature.purpose;
    let group = groups.get(purpose);
    if (!group) {
      group = {
        purpose,
        label: PURPOSE_LABEL[purpose] ?? purpose,
        features: [],
        topic: topicForPurpose(purpose),
      };
      groups.set(purpose, group);
    }
    group.features.push(feature);
  }
  return [...groups.values()];
}

/** The feature's extent in assembly space, which is what a section has to cross. */
function extentOf(part: Part, feature: Feature): { min: Vec3; max: Vec3 } | null {
  const f = frameOf(part);
  const pts: Array<{ x: number; y: number }> =
    feature.kind === 'drill'
      ? [
          { x: feature.x - feature.diameter / 2, y: feature.y - feature.diameter / 2 },
          { x: feature.x + feature.diameter / 2, y: feature.y - feature.diameter / 2 },
          { x: feature.x + feature.diameter / 2, y: feature.y + feature.diameter / 2 },
          { x: feature.x - feature.diameter / 2, y: feature.y + feature.diameter / 2 },
        ]
      : feature.kind === 'engrave'
        ? []
        : tessellate(feature.path, 1);
  if (pts.length === 0) return null;

  const lift = (p: { x: number; y: number }): Vec3 => ({
    x: f.origin.x + f.u.x * p.x + f.v.x * p.y,
    y: f.origin.y + f.u.y * p.x + f.v.y * p.y,
    z: f.origin.z + f.u.z * p.x + f.v.z * p.y,
  });
  const lifted = pts.map(lift);
  const axis = (a: Axis): [number, number] => [
    Math.min(...lifted.map((p) => p[a])),
    Math.max(...lifted.map((p) => p[a])),
  ];
  const [x0, x1] = axis('x');
  const [y0, y1] = axis('y');
  const [z0, z1] = axis('z');
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } };
}

const AXES: Axis[] = ['z', 'y', 'x'];

/**
 * Where to cut the live assembly so a chosen feature is in the picture.
 *
 * Three rules, each of which is a picture that would otherwise be useless:
 *
 * 1. **Never cut along the part's own face.** A plane parallel to the blank
 *    slices nothing out of it, so the panel the user asked about would be
 *    drawn as an outline standing behind the section.
 * 2. **Never land the plane inside another panel.** It would show that
 *    panel's face rather than a cut through it — the same trap
 *    `bestSectionAt` avoids when it picks a plane on its own.
 * 3. **Cut across the feature's longest run.** A groove sectioned along its
 *    length is a rectangle; sectioned across it, it is a groove.
 */
export function sectionThrough(
  project: ProjectResult,
  part: Part,
  feature: Feature,
): SectionView | null {
  const extent = extentOf(part, feature);
  if (extent === null) return null;
  const f = frameOf(part);
  const centre: Vec3 = {
    x: (extent.min.x + extent.max.x) / 2,
    y: (extent.min.y + extent.max.y) / 2,
    z: (extent.min.z + extent.max.z) / 2,
  };

  const inAPanel = (axis: Axis, at: number): boolean =>
    project.parts.some((other) => {
      if (other.id === part.id) return false;
      const of = frameOf(other);
      if (Math.abs(dot3(of.n, unit(axis))) < 0.5) return false;
      return at > other.box.min[axis] + 0.2 && at < other.box.max[axis] - 0.2;
    });

  const candidates = AXES.filter((axis) => Math.abs(dot3(f.n, unit(axis))) < 0.5)
    .map((axis) => ({
      axis,
      run: extent.max[axis] - extent.min[axis],
      clear: !inAPanel(axis, centre[axis]),
    }))
    // A clear plane first, then the longest run through the feature. Ties go
    // to the first axis in AXES — a plan view before an elevation, which is
    // the way round a hinge cup and a slide hole read.
    //
    // Every axis can be blocked at once: a screw through a side panel lands on
    // the centreline of the shelf it is pulling in (so the plan is inside that
    // shelf) and, in a face-framed carcass, behind a stile (so the elevation
    // is inside that). A slightly awkward section beats no picture, so a
    // blocked plane is used rather than refused — the panel it lands in is
    // drawn as an outline and the machining still reads.
    .sort((a, b) => Number(b.clear) - Number(a.clear) || b.run - a.run);
  const chosen = candidates[0];
  if (!chosen) return null;

  // Wide enough to show what the feature is cut into, and never so tight that
  // a 5 mm pin hole fills the frame with nothing around it for scale.
  const across = AXES.filter((a) => a !== chosen.axis).map((a) => extent.max[a] - extent.min[a]);
  const window = Math.min(400, Math.max(60, 3 * Math.max(part.thickness, ...across)));
  return {
    kind: 'section',
    axis: chosen.axis,
    at: centre[chosen.axis],
    focus: { at: centre, window },
  };
}

const unit = (axis: Axis): Vec3 => ({
  x: axis === 'x' ? 1 : 0,
  y: axis === 'y' ? 1 : 0,
  z: axis === 'z' ? 1 : 0,
});

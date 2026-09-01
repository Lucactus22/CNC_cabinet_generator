import {
  partsNeedingFlip,
  resolveHardware,
  type Carcass,
  type Feature,
  type Part,
  type PartRole,
  type ProjectParams,
  type ProjectResult,
} from '@cabgen/core';
import { stackOn } from '../gallery/samples';
import type { View } from '../gallery/render';

/**
 * What this tool can make, in the words of somebody who would use it.
 *
 * R-16's discovery audit found that nothing in the interface says what the
 * tool can do: fifteen geometric capabilities sit inside groups that are
 * closed at rest, and the knowledge that explains them lives in `docs/`,
 * which nobody reads while designing. R-18 turned the *choices* into
 * pictures. This is the other half — the capabilities that are not a choice
 * between two options, and the sentence that says why each one is shaped the
 * way it is.
 *
 * Three rules hold the file together.
 *
 * **Every topic cites the doc it came from, by heading.** `explain.test.ts`
 * opens that file, finds that section, and checks that the phrases the
 * explanation leans on are still in it. An explanation that outlives the
 * behaviour it explains is worse than none: it is a wrong number with the
 * authority of documentation.
 *
 * **No dimension is typed here.** Anything with a number in it reads that
 * number off the live project or the part in front of the user, through
 * `measures`. A hinge cup centre written into a sentence would be a
 * hardcoded copy of a catalogue entry, and would still say 52.5 mm after
 * somebody selected a different hinge.
 *
 * **A picture is the tool's own output or there is no picture.** `seed`
 * shapes a sample the real pipeline builds; the test asserts the thing the
 * topic is about is genuinely in it. Where a capability has no shape of its
 * own — edge banding takes two millimetres off a blank — it is words, the
 * same way the nesting gallery is.
 */

export type TopicGroup =
  'joints' | 'panels' | 'insides' | 'fronts' | 'surfaces' | 'cabinets' | 'room';

export const GROUP_LABEL: Record<TopicGroup, string> = {
  joints: 'How it goes together',
  panels: 'Panels, tops and backs',
  insides: 'What goes inside',
  fronts: 'Doors and drawers',
  surfaces: 'Faces and edges',
  cabinets: 'Kinds of cabinet',
  room: 'Fitting a real room',
};

export const GROUP_ORDER: TopicGroup[] = [
  'joints',
  'panels',
  'insides',
  'fronts',
  'surfaces',
  'cabinets',
  'room',
];

/** The doc section an explanation is answerable to. */
export interface DocSource {
  /** File under `docs/`. */
  doc: string;
  /** A heading in that file, without the leading hashes. */
  heading: string;
}

export interface Measured {
  label: string;
  /** Read off the live project, never written here. */
  value: string;
}

export interface ExplainContext {
  params: ProjectParams;
  project: ProjectResult;
  /** The blank in front of the user, when the explanation was reached by selecting one. */
  part?: Part;
  /** The pocket, cut or hole they clicked on. */
  feature?: Feature;
}

export interface Topic {
  id: string;
  group: TopicGroup;
  /** What a woodworker calls it. */
  title: string;
  /** What it is, in one sentence. */
  what: string;
  /** Why it is shaped that way — the constraint, not the description. */
  why: string;
  source: DocSource;
  /**
   * Phrases the two sentences above stand on, checked to still be in the
   * cited section. Not a quotation of the whole doc: the point is that if
   * somebody rewrites the joint and its section, the explanation fails a test
   * rather than quietly going on saying the old thing.
   */
  grounds: string[];
  /** How to make a sample that contains it, and how to look at it. */
  picture?: { seed: (p: ProjectParams) => void; view: View };
  /**
   * Why there is no picture, when there is none.
   *
   * Required rather than optional in practice — the test insists on it —
   * because "we could not be bothered" and "there is genuinely nothing to
   * draw" look identical from outside, and only one of them is honest.
   */
  insteadOfAPicture?: string;
  /** Whether a built project actually has it in it. */
  present?: (project: ProjectResult, params: ProjectParams) => boolean;
  /** The numbers, off the live project. */
  measures?: (ctx: ExplainContext) => Measured[];
  /** The catalogue path of the control that switches it on, so "set it" can go there. */
  param?: string;
  /** Feature purposes this topic explains, so clicking machining lands on it. */
  purposes?: string[];
}

// --------------------------------------------------------------- predicates

const featuresOf = (part: Part): Array<Feature & { purpose: string }> =>
  part.features.filter((f): f is Feature & { purpose: string } => f.kind !== 'engrave');

const hasPurpose =
  (...purposes: string[]) =>
  (project: ProjectResult): boolean =>
    project.parts.some((part) => featuresOf(part).some((f) => purposes.includes(f.purpose)));

/**
 * A joint, told apart by what the material actually does.
 *
 * `purpose` says what a feature is *for* — a shelf, a divider — and both joint
 * styles use the same words for it, so a project cut with tabs would satisfy
 * "it has a stopped dado" if the purpose were all that was asked. The
 * difference is the kind: a housing is a pocket, a tab passes right through.
 */
const hasJoint =
  (kind: 'pocket' | 'through') =>
  (project: ProjectResult): boolean =>
    project.parts.some((part) =>
      featuresOf(part).some(
        (f) => f.kind === kind && ['carcass', 'shelf', 'divider'].includes(f.purpose),
      ),
    );

const hasRole =
  (...roles: PartRole[]) =>
  (project: ProjectResult): boolean =>
    project.parts.some((part) => roles.includes(part.role));

const mm = (n: number): string => `${Math.round(n * 100) / 100} mm`;

/**
 * The carcass a part came out of.
 *
 * Matched on the cabinet as well as the carcass, because carcass ids are only
 * unique within their cabinet — every base is `B` — so searching the run for
 * the first `B` reads a second cabinet's panel off the first cabinet's
 * settings. A toe kick height quoted from the wrong box is exactly the kind of
 * confident wrong number this whole file is written to avoid.
 */
const carcassOf = (params: ProjectParams, part?: Part): Carcass | undefined =>
  part === undefined
    ? undefined
    : params.cabinets
        .find((c) => c.id === part.cabinetId)
        ?.carcasses.find((k) => k.id === part.carcassId);

/** The pocket or hole in front of the user, when there is one, in its own numbers. */
function cutMeasures(ctx: ExplainContext): Measured[] {
  const f = ctx.feature;
  if (!f) return [];
  if (f.kind === 'pocket') {
    return [
      { label: 'Cut to', value: mm(f.depth) },
      // Which face, and *only* that: a feature on face B does not mean the
      // blank is turned over — a panel machined entirely from B is cut in one
      // setup like any other. The flip is a property of the part, so it is
      // read off the part.
      { label: 'Machined from', value: `face ${f.side}` },
      ...(ctx.part && partsNeedingFlip([ctx.part]).length > 0
        ? [{ label: 'Both faces', value: 'this blank is turned over on the bed' }]
        : []),
    ];
  }
  if (f.kind === 'drill') {
    return [
      { label: 'Hole', value: `Ø${mm(f.diameter)}` },
      { label: 'Depth', value: f.depth === 'thru' ? 'right through' : mm(f.depth) },
    ];
  }
  if (f.kind === 'through') return [{ label: 'Cut', value: 'right through the panel' }];
  return [];
}

// A shelf gives a sample something to be housed into, which is what makes a
// dado visible in it at all; the tab-and-slot pictures need the same box under
// a different joint so the two are comparable.
const withShelf = (p: ProjectParams): void => {
  const bay = p.cabinets[0]!.carcasses[0]!.bays[0]!;
  bay.shelves = 'fixed';
  bay.shelfCount = 1;
};

const withDoor = (p: ProjectParams): void =>
  void (p.cabinets[0]!.carcasses[0]!.bays[0]!.doors = 'left');

const withDrawers = (p: ProjectParams): void =>
  void (p.cabinets[0]!.carcasses[0]!.bays[0]!.drawerFrontHeights = [110, 110, 110]);

export const TOPICS: Topic[] = [
  // ----------------------------------------------------------------- joints
  {
    id: 'stopped-dado',
    group: 'joints',
    title: 'The stopped dado',
    what: 'A groove across the receiving panel that the mating panel drops into, held back from the front edge so nothing shows on the finished face.',
    why: 'A round cutter leaves a fillet in each end of the groove, so the tongue is notched to start past it. Without that notch the joint never seats, however hard you hit it.',
    source: { doc: 'JOINERY.md', heading: 'Stopped dado (default)' },
    grounds: [
      'The groove stops short of the front edge',
      'the mating panel',
      'fillet',
      'Set the front stop to zero for a through dado',
    ],
    picture: {
      seed: (p) => {
        p.joinery.carcassJoint = 'dado';
        withShelf(p);
      },
      // Cropped to the left-hand joint: a whole box in section puts a 6 mm
      // groove under a pixel, which is a picture of a cabinet rather than of
      // the thing this topic is about.
      view: { kind: 'section', axis: 'y', crop: { at: 'left', size: 0.45 } },
    },
    present: hasJoint('pocket'),
    param: 'joinery.dadoDepth',
    purposes: ['carcass', 'shelf', 'divider', 'toe-rail', 'hanging-rail'],
    measures: (ctx) => [
      ...cutMeasures(ctx),
      { label: 'Dado depth asked for', value: mm(ctx.params.joinery.dadoDepth) },
      { label: 'Stopped short of the front by', value: mm(ctx.params.joinery.dadoStopFront) },
      { label: 'Fit clearance in the width', value: mm(ctx.params.joinery.fitClearance) },
      { label: 'Cutter', value: `Ø${mm(ctx.params.tool.diameter)}` },
    ],
  },
  {
    id: 'tab-and-slot',
    group: 'joints',
    title: 'Through tab and slot',
    what: 'Tenons on one panel pass right through mortises in the other, so the box knocks together and stays together with no fasteners at all.',
    why: 'The tab ends show on the outside face. That is the trade: a joint you can see, for a box that needs no screws, no glue-up clamps and nothing bought in.',
    source: { doc: 'JOINERY.md', heading: 'Through tab and slot' },
    grounds: [
      'Self-jigging and needs no fasteners',
      'visible on the outside face',
      'never wider than 60% of the pitch',
    ],
    picture: {
      seed: (p) => {
        p.joinery.carcassJoint = 'tabslot';
        withShelf(p);
      },
      view: { kind: 'iso', azimuth: 34, elevation: 20 },
    },
    present: hasJoint('through'),
    param: 'joinery.carcassJoint',
    measures: ({ params }) => [
      { label: 'Tab width', value: mm(params.joinery.tabWidth) },
      { label: 'Tabs per joint, at least', value: String(params.joinery.tabMinCount) },
    ],
  },
  {
    id: 'corner-relief',
    group: 'joints',
    title: 'Corner relief',
    what: 'A bite taken out of every square inside corner — on the diagonal for a dogbone, along one wall for a T-bone — so a square tongue can reach the bottom of it.',
    why: 'The cutter is round and the corner is not. Without the bite the two parts stand apart by a tool radius and no amount of clamping closes them.',
    source: { doc: 'JOINERY.md', heading: 'Choosing' },
    grounds: [
      'Dogbone is the default',
      'Relief only ever applies to tab and slot',
      'The joints will not close otherwise',
    ],
    picture: {
      seed: (p) => {
        p.joinery.carcassJoint = 'tabslot';
        withShelf(p);
      },
      view: { kind: 'detail', pick: (part) => part.role === 'side', window: 26 },
    },
    present: hasJoint('through'),
    param: 'joinery.reliefStyle',
  },
  {
    id: 'screw-holes',
    group: 'joints',
    title: 'Screw holes, already in the right place',
    what: 'Clearance holes bored right through the panel that carries the groove, landing on the centreline of whatever drops into it.',
    why: 'Nothing to mark out at assembly, and nothing to guess: the hole is where the screw goes. Sized to clear the threads, never to grip them.',
    source: { doc: 'JOINERY.md', heading: 'Stopped dado (default)' },
    grounds: [
      'Clearance holes go right through the panel that receives the groove',
      'jacks the joint apart instead of drawing it together',
      'There is no countersink',
    ],
    picture: {
      seed: (p) => {
        p.joinery.carcassJoint = 'dado';
        p.joinery.screwHoles = true;
        withShelf(p);
      },
      view: { kind: 'detail', pick: (part) => part.role === 'side' },
    },
    present: hasPurpose('screw'),
    param: 'joinery.screwHoles',
    purposes: ['screw'],
    measures: ({ params }) => [
      { label: 'Clearance hole', value: `Ø${mm(params.joinery.screwClearanceDiameter)}` },
      { label: 'Spaced along the joint at', value: mm(params.joinery.screwSpacing) },
    ],
  },
  {
    id: 'half-lap',
    group: 'joints',
    title: 'The face frame’s half laps',
    what: 'Where a stile crosses a rail each gives up half its own thickness, cut from opposite faces, so the two halves add up to the frame’s full thickness.',
    why: 'A frame is coplanar — neither member is housed in the other — so neither the dado nor the tab applies. Cutting the stile from its back leaves its front, and the face a hinge plate bores into, untouched.',
    source: { doc: 'JOINERY.md', heading: 'Half lap (face frame)' },
    grounds: ['opposite faces', 'half its own thickness', 'No relief is needed'],
    picture: {
      seed: (p) => {
        p.cabinets[0]!.carcasses[0]!.construction = 'face-frame';
        withDoor(p);
      },
      // A stile is a long thin part, so the whole blank is a sliver at this
      // size. The window lands on the lap itself.
      view: { kind: 'detail', pick: (part) => part.role === 'stile', window: 110 },
    },
    present: hasPurpose('face-frame-lap'),
    param: 'cabinets[].carcasses[].construction',
    purposes: ['face-frame-lap', 'face-frame'],
  },
  {
    id: 'one-face-rule',
    group: 'joints',
    title: 'Machined from one face',
    what: 'Every part that can be is cut without ever being turned over. The one that genuinely cannot is a divider with shelves on both sides.',
    why: 'Flipping a panel is the main source of error and lost time on a hobby machine. What has to be flipped is written to _FLIP layers, mirrored, and named in the diagnostics rather than left for you to notice.',
    source: { doc: 'JOINERY.md', heading: 'The one-face rule' },
    grounds: [
      'a divider with shelves on both sides',
      '_FLIP',
      'Flipping is the main source of error',
    ],
    picture: {
      seed: (p) => {
        const carcass = p.cabinets[0]!.carcasses[0]!;
        carcass.dividerCount = 1;
        carcass.bays = [
          { shelves: 'fixed', shelfCount: 1, doors: 'none', drawerFrontHeights: [] },
          { shelves: 'fixed', shelfCount: 1, doors: 'none', drawerFrontHeights: [] },
        ];
      },
      view: { kind: 'detail', pick: (part) => part.role === 'divider' },
    },
    // The rule is about a panel that genuinely has to be turned over, which is
    // not the same as "there is a divider": a divider with shelves on one side
    // only is machined in a single setup like anything else.
    present: (project) => partsNeedingFlip(project.parts).length > 0,
  },

  // ----------------------------------------------------------------- panels
  {
    id: 'capped-top',
    group: 'panels',
    title: 'A capped top, or an inset one',
    what: 'A capped top lies over the sides and spans the full width, so from above the surface is unbroken. An inset one sits between them and their end grain shows alongside it.',
    why: 'The locating dados land on the top panel’s underside, which is already the face being machined for the dividers and the back — so capping costs no extra setup and no flip.',
    source: { doc: 'JOINERY.md', heading: 'Capped vs inset tops' },
    grounds: ['one unbroken surface', 'underside', 'end grain flush with the surface'],
    picture: {
      seed: (p) => void (p.cabinets[0]!.carcasses[0]!.topStyle = 'capped'),
      view: { kind: 'section', axis: 'y', crop: { at: 'top-left', size: 0.5 } },
    },
    present: hasRole('top'),
    param: 'cabinets[].carcasses[].topStyle',
  },
  {
    id: 'stacked-carcass',
    group: 'panels',
    title: 'A box with no bottom of its own',
    what: 'A carcass standing on another can be built without a bottom panel: its sides, dividers and back stand in shallow locating dados cut into the top face of the panel below.',
    why: 'One panel fewer, and the joint locates itself. The cost is that the shared panel is machined on both faces and has to be turned over — and the two sets of pockets nearly meet, which is why the locating dado is shallow.',
    source: { doc: 'JOINERY.md', heading: 'Standing one carcass in the top of another' },
    grounds: [
      'without a bottom panel',
      'turned over on the bed',
      'The two sets of pockets also **cross**',
    ],
    picture: {
      seed: (p) => {
        stackOn(p);
        p.cabinets[0]!.carcasses[1]!.floor = 'below';
      },
      view: { kind: 'section', axis: 'y', crop: { at: 'left', size: 0.55 } },
    },
    present: (project, params) =>
      params.cabinets.some((c) => c.carcasses.some((k, i) => i > 0 && k.floor === 'below')) &&
      project.parts.length > 0,
    param: 'cabinets[].carcasses[].floor',
    measures: ({ params }) => [
      { label: 'Locating dado depth', value: mm(params.joinery.stackDadoDepth) },
    ],
  },
  {
    id: 'back-panel',
    group: 'panels',
    title: 'The back, in a groove or in a rabbet',
    what: 'A grooved back is captured on all four edges behind a shoulder of solid material. A rabbeted one runs out to the rear edge instead, so the back and the sides finish in one plane.',
    why: 'Groove keeps the back invisible from behind and squares the box up on its own. Rabbet is what you want when the back of the cabinet has to meet a wall that is not flat — it scribes in one pass.',
    source: { doc: 'JOINERY.md', heading: 'Back panels' },
    grounds: [
      'Captured on all four sides',
      'leaving a shoulder of solid material behind it',
      'scribed or planed to an out-of-true wall in one pass',
    ],
    picture: {
      seed: (p) => void (p.cabinets[0]!.carcasses[0]!.back.style = 'rabbet'),
      view: { kind: 'section', axis: 'z', crop: { at: 'top-left', size: 0.5 } },
    },
    present: hasPurpose('back'),
    param: 'cabinets[].carcasses[].back.style',
    purposes: ['back'],
    measures: ({ params, part }) => {
      const carcass = carcassOf(params, part);
      return carcass
        ? [{ label: 'Held in from the rear edge by', value: mm(carcass.back.inset) }]
        : [];
    },
  },
  {
    id: 'toe-kick',
    group: 'panels',
    title: 'The toe kick',
    what: 'The front bottom corner of each side is notched away and a rail is housed between them, set back, so the box stands on a plinth with your toes under it.',
    why: 'Only the carcass actually on the floor gets one. Above ground the same notch is a recess in the middle of a run, cut into the panel that is carrying the box above.',
    source: { doc: 'JOINERY.md', heading: 'Toe kick' },
    grounds: [
      'notched away at the front bottom corner',
      'housed in a plain dado between the sides',
      'Only the carcass actually on the floor gets one',
    ],
    picture: {
      seed: (p) => {
        p.cabinets[0]!.carcasses[0]!.toeKick = { enabled: true, height: 100, setback: 50 };
      },
      view: { kind: 'section', axis: 'x' },
    },
    present: hasRole('toe-rail'),
    param: 'cabinets[].carcasses[].toeKick.enabled',
    purposes: ['toe-rail'],
    measures: ({ params, part }) => {
      const carcass = carcassOf(params, part);
      if (!carcass) return [];
      return [
        { label: 'Height', value: mm(carcass.toeKick.height) },
        { label: 'Set back from the front by', value: mm(carcass.toeKick.setback) },
      ];
    },
  },
  {
    id: 'hanging-rail',
    group: 'panels',
    title: 'The hanging rail',
    what: 'A strip of full carcass-thickness material housed across the top of each bay, flush under the top panel and against the back, drilled through its face for the screws that hold the cabinet up.',
    why: 'A thin back panel is not what you hang a loaded wall cabinet on. The rail is one segment per bay, because a divider reaches the top regardless and a rail spanning the full width would run straight through it.',
    source: { doc: 'JOINERY.md', heading: 'Hanging rail' },
    grounds: ['one segment per bay', 'through its face', 'at least two studs'],
    picture: {
      seed: (p) => {
        p.cabinets[0]!.carcasses[0]!.hangingRail = {
          enabled: true,
          height: 100,
          screwDiameter: 6,
          screwSpacing: 400,
        };
      },
      view: { kind: 'section', axis: 'x' },
    },
    present: hasRole('hanging-rail'),
    param: 'cabinets[].carcasses[].hangingRail.enabled',
    purposes: ['hanging-rail', 'wall-mount'],
    measures: ({ params, part }) => {
      const carcass = carcassOf(params, part);
      if (!carcass) return [];
      return [
        { label: 'Rail height', value: mm(carcass.hangingRail.height) },
        { label: 'Screws no further apart than', value: mm(carcass.hangingRail.screwSpacing) },
      ];
    },
  },

  // ---------------------------------------------------------------- insides
  {
    id: 'shelf-pins',
    group: 'insides',
    title: 'Adjustable shelves on a 32 mm ladder',
    what: 'Two rows of holes bored up each side of the bay at the 32 mm pitch, so a loose shelf moves whenever the thing standing on it changes.',
    why: 'The ladder is anchored to the bottom of the opening rather than centred, so both sides of a bay — and both rows on a side — always line up. A hole that would break through the panel is an error, not a hole.',
    source: { doc: 'JOINERY.md', heading: 'Shelf pins (32 mm system)' },
    grounds: [
      '32 mm',
      'anchored to the bottom of the opening rather than centred',
      'clear of hinge plates',
    ],
    picture: {
      seed: (p) => void (p.cabinets[0]!.carcasses[0]!.bays[0]!.shelves = 'adjustable'),
      view: { kind: 'detail', pick: (part) => part.role === 'side' },
    },
    present: hasPurpose('shelf-pin'),
    param: 'cabinets[].carcasses[].bays[].shelves',
    purposes: ['shelf-pin'],
    measures: ({ params }) => {
      const pin = resolveHardware(params.hardware).shelfPin;
      return [
        { label: 'Bored for', value: pin.name },
        { label: 'Hole', value: `Ø${mm(pin.boring.diameter)} × ${mm(pin.boring.depth)} deep` },
        { label: 'Pitch', value: mm(pin.boring.pitch) },
        {
          label: 'Rows in from front and back',
          value: `${mm(params.joinery.shelfPin.frontOffset)} / ${mm(params.joinery.shelfPin.backOffset)}`,
        },
      ];
    },
  },

  // ----------------------------------------------------------------- fronts
  {
    id: 'door-fit',
    group: 'fronts',
    title: 'Overlay or inset fronts',
    what: 'Overlay hangs the doors in front of the carcass, each leaf covering half of whatever it shares with its neighbour. Inset sits them inside the opening with a clearance all round.',
    why: 'Overlay hides the carcass edges and forgives a box that is slightly out of square. Inset shows every gap you have, which means the box has to be square and stay square.',
    source: { doc: 'DOORS.md', heading: 'Fit' },
    grounds: [
      'hangs the doors in front of the carcass',
      'sits the door inside the opening with a clearance all round',
      'an even reveal throughout',
    ],
    picture: {
      seed: withDoor,
      view: { kind: 'section', axis: 'z', crop: { at: 'bottom-left', size: 0.3 } },
    },
    present: hasRole('door'),
    param: 'doors.fit',
  },
  {
    id: 'hinge-boring',
    group: 'fronts',
    title: 'The hinge cup and its plate holes',
    what: 'A 35 mm cup pocketed into the back of the door, its dowel holes beside it, and two holes on the 32 mm system in the panel or stile the plate screws to.',
    why: 'The cup centre is the boring distance plus the cup’s own radius — the number people get wrong, and the one that decides whether the door shuts. It comes from the catalogue entry for the hinge you actually bought.',
    source: { doc: 'DOORS.md', heading: 'Hinge boring' },
    grounds: [
      'boring distance',
      'this is the number people get wrong',
      'emitted as a **pocket**, not a drilled hole',
    ],
    picture: {
      seed: withDoor,
      view: { kind: 'detail', pick: (part) => part.role === 'door', window: 110 },
    },
    present: hasPurpose('hinge-cup'),
    param: 'hardware.hingeId',
    purposes: ['hinge-cup', 'hinge-dowel', 'hinge-plate'],
    measures: ({ params }) => {
      const hinge = resolveHardware(params.hardware).hinge;
      return [
        { label: 'Hinge', value: hinge.name },
        {
          label: 'Cup',
          value: `Ø${mm(hinge.boring.cupDiameter)} × ${mm(hinge.boring.cupDepth)} deep`,
        },
        {
          label: 'Cup centre from the door edge',
          value: mm(hinge.boring.boringDistance + hinge.boring.cupDiameter / 2),
        },
      ];
    },
  },
  {
    id: 'drawer-box',
    group: 'fronts',
    title: 'The drawer box',
    what: 'Four parts and a bottom, sized from the bay’s own clear opening and the runner it will hang on, with the visible face screwed on separately from inside.',
    why: 'The width is not a guess: Blum publish it as the opening width less a fixed deduction for the runner. Get it wrong by two millimetres and the drawer binds or rattles.',
    source: { doc: 'DRAWERS.md', heading: 'The width formula' },
    grounds: [
      'Inside drawer width must equal opening width minus 42',
      'widthDeduction',
      'outside width',
    ],
    picture: {
      seed: withDrawers,
      view: { kind: 'section', axis: 'x' },
    },
    present: hasRole('drawer-side'),
    param: 'cabinets[].carcasses[].bays[].drawerFrontHeights',
    purposes: ['drawer-box', 'drawer-box-back', 'drawer-box-bottom'],
    measures: ({ params }) => {
      const slide = resolveHardware(params.hardware).slide;
      return [
        { label: 'Runner', value: slide.name },
        { label: 'Opening less', value: mm(slide.boring.widthDeduction) },
        {
          label: 'Running lengths',
          value: slide.boring.nominalLengths.map((n) => `${n}`).join(', '),
        },
      ];
    },
  },
  {
    id: 'slide-holes',
    group: 'fronts',
    title: 'Slide mounting holes',
    what: 'A symmetric pair of holes held in from each end of the runner, bored on the box’s own sides and on the two cabinet panels the bay is bounded by.',
    why: 'Deliberately generic. Blum’s real screw positions are a different pair of offsets for every runner length, and transcribing that table is a promise this generator cannot keep — so it says so rather than inventing one.',
    source: { doc: 'DRAWERS.md', heading: 'Slide mounting holes' },
    grounds: [
      'generic, symmetric pair of mounting holes',
      'mountInset',
      'a lookup table nobody would want to maintain',
    ],
    picture: {
      seed: withDrawers,
      view: { kind: 'detail', pick: (part) => part.role === 'drawer-side' },
    },
    present: hasPurpose('slide-side', 'slide-panel'),
    param: 'hardware.slideId',
    purposes: ['slide-side', 'slide-panel'],
  },
  {
    id: 'handles',
    group: 'fronts',
    title: 'Handles',
    what: 'Clearance holes through the front for a bar handle or a knob, at fixing centres taken from the catalogue.',
    why: 'Where it sits is taste, not specification, so it is a setting with a conventional default — and the diagnostics read it back as a sentence, because nobody can check taste with a rule.',
    source: { doc: 'HARDWARE.md', heading: 'Where a handle goes' },
    grounds: [
      'taste rather than specification',
      'referenced to the opening edge',
      'the diagnostics read the placement back as a sentence',
    ],
    picture: {
      seed: (p) => {
        withDoor(p);
        p.hardware.handleId = 'bar-128';
      },
      view: { kind: 'detail', pick: (part) => part.role === 'door' },
    },
    present: hasPurpose('handle'),
    param: 'hardware.handleId',
    purposes: ['handle'],
    measures: ({ params }) => {
      const handle = resolveHardware(params.hardware).handle;
      if (!handle) return [];
      return [
        { label: 'Handle', value: handle.name },
        { label: 'Clearance holes', value: `Ø${mm(handle.boring.screwDiameter)}` },
        ...(handle.boring.centres > 0
          ? [{ label: 'Fixing centres', value: mm(handle.boring.centres) }]
          : []),
      ];
    },
  },

  // --------------------------------------------------------------- surfaces
  {
    id: 'surface-grooves',
    group: 'surfaces',
    title: 'Grooved faces',
    what: 'Evenly spaced cuts across a face — beadboard on a back panel, fluting or panelling on a door.',
    why: 'They are set out inside the part’s exposed region, so a groove is never cut across a tongue buried in a joint. Even spacing divides the face into whole bays rather than leaving a sliver at one end.',
    source: { doc: 'EFFECTS.md', heading: 'Grooves' },
    grounds: ['beadboard look', 'Cannot be narrower than your cutter', 'Centre-to-centre'],
    picture: {
      seed: (p) => {
        withDoor(p);
        p.surfaceEffects = [
          {
            id: 'fx',
            enabled: true,
            target: { select: 'role', role: 'door' },
            face: 'outside',
            effect: {
              kind: 'grooves',
              direction: 'vertical',
              spacing: 45,
              width: Math.max(4, p.tool.diameter),
              depth: 3,
              margin: 0,
              fit: 'even',
            },
          },
        ];
      },
      view: { kind: 'detail', pick: (part) => part.role === 'door' },
    },
    present: hasPurpose('surface-grooves'),
    param: 'surfaceEffects',
    purposes: ['surface-grooves'],
  },
  {
    id: 'surface-frame',
    group: 'surfaces',
    title: 'A shaker line',
    what: 'One rectangular groove run round a front, inset from its edges.',
    why: 'It is the look of a framed door without making a real frame: four straight runs, cut on the same setup as the blank, so any CAM clears it without understanding the corners.',
    source: { doc: 'EFFECTS.md', heading: 'Frame' },
    grounds: ['the shaker line on the doors', 'four straight runs', 'inset from the panel edge'],
    picture: {
      seed: (p) => {
        withDoor(p);
        p.surfaceEffects = [
          {
            id: 'fx',
            enabled: true,
            target: { select: 'role', role: 'door' },
            face: 'outside',
            effect: { kind: 'frame', margin: 50, width: Math.max(6, p.tool.diameter), depth: 4 },
          },
        ];
      },
      view: { kind: 'detail', pick: (part) => part.role === 'door' },
    },
    present: hasPurpose('surface-frame'),
    param: 'surfaceEffects',
    purposes: ['surface-frame'],
  },
  {
    id: 'edge-banding',
    group: 'surfaces',
    title: 'Edge banding',
    what: 'Declare which edges of a kind of part get tape, and those edges are cut short by the tape’s own thickness before the outline is built.',
    why: 'Gluing the tape on afterwards brings the part back to the size it was designed at. Cut to the full size instead and every banded panel comes out oversize by two tape thicknesses — on a door, that is a reveal that closes up.',
    source: { doc: 'JOINERY.md', heading: 'Not a joint either: edge banding' },
    grounds: [
      'cut short by the tape’s own thickness',
      'reported in the cut list by length, not by area',
      'the panel’s *finished* size along it',
    ],
    // Not for want of trying: the whole of this is two millimetres off a
    // blank. A tile showing a door that looks exactly like an unbanded door
    // would teach the opposite of the truth.
    insteadOfAPicture:
      'Two millimetres off the edge of a blank. At any size that fits a door in, a banded door and an unbanded one are the same picture.',
    present: (project) => project.parts.some((p) => p.bandedEdges.length > 0),
    param: 'edgeBanding[].edges',
  },

  // --------------------------------------------------------------- cabinets
  {
    id: 'cabinet-types',
    group: 'cabinets',
    title: 'Base, wall, tall and stacked',
    what: 'Four starting points, each seeding an ordinary cabinet: a wall unit is one with the toe kick off and a hanging rail on, not a different kind of object.',
    why: 'Nothing downstream branches on which type produced a cabinet, so anything one type can do, any of them can. Change a wall unit’s mind about the floor and it is a base unit.',
    source: { doc: 'ARCHITECTURE.md', heading: 'The project model' },
    grounds: [
      'as *presets*, not classes',
      'The builder has no branch on which type produced a cabinet',
    ],
    // No picture, and for a different reason from the other two: there are
    // four of them and one tile. All four are drawn, from their own `build()`,
    // at the moment you add a cabinet — which is where the choice is, and
    // where R-18 put them.
    insteadOfAPicture:
      'Four of them and one tile. All four are drawn, from their own build, at the moment you add a cabinet — which is where the choice actually is.',
    param: 'cabinets[].name',
  },

  // ------------------------------------------------------------------- room
  {
    id: 'scribe',
    group: 'room',
    title: 'Scribing to a crooked room',
    what: 'Measure the opening and the run gets a sacrificial strip at each walled end, cut a little oversize — tapered when the walls lean — to be planed to the plaster on site.',
    why: 'The carcass stays square. Every joint here assumes a rectangle, and a box built out of square has a door that binds and a drawer that runs on one runner; a cabinetmaker builds square and scribes the interface.',
    source: {
      doc: 'OPENING.md',
      heading: 'The decision everything else follows from: the carcass stays square',
    },
    grounds: [
      'A cabinetmaker builds square and scribes the *interface* to the wall',
      'sacrificial parts at the edges of the run',
      'planed to fit in five minutes on site',
    ],
    picture: {
      seed: (p) => {
        p.opening.enabled = true;
        p.opening.widthAtTop = 560;
        p.opening.widthAtBottom = 575;
        p.opening.heightAtLeft = 800;
        p.opening.heightAtRight = 800;
        p.opening.left = 'wall';
        p.opening.right = 'wall';
      },
      view: { kind: 'iso', azimuth: 24, elevation: 16 },
    },
    present: hasRole('scribe'),
    param: 'opening.enabled',
  },
  {
    id: 'corner-angle',
    group: 'room',
    title: 'The corner angle, measured rather than guessed',
    what: 'Two lengths along the walls and the diagonal between them. The angle is derived from that triangle.',
    why: 'Nobody can measure a room corner with a protractor, and a guessed angle is the one the fillers get cut to. Three tape readings you can actually take beat one number you cannot.',
    source: { doc: 'OPENING.md', heading: 'How to measure it' },
    grounds: ['diagonal', 'triangle'],
    insteadOfAPicture:
      'Three tape readings and the arithmetic between them. Nothing is cut differently until the angle they give changes the fillers.',
    present: (_project, params) =>
      params.opening.enabled &&
      (params.opening.cornerTriangleLeft !== undefined ||
        params.opening.cornerTriangleRight !== undefined),
    param: 'opening.cornerTriangleLeft',
  },
];

export const topicById = (id: string): Topic | undefined => TOPICS.find((t) => t.id === id);

/**
 * Which topic explains a piece of machining.
 *
 * Keyed on the `purpose` every feature already carries for the layer grouping,
 * so a new joint that sets a purpose nobody has written about shows up in the
 * test rather than as a blank panel in the app.
 */
export function topicForPurpose(purpose: string): Topic | undefined {
  return TOPICS.find((t) => t.purposes?.includes(purpose));
}

export interface TopicMatch {
  topic: Topic;
  score: number;
}

const loose = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Find an explanation by name.
 *
 * The palette's own search is over *parameters*, which only helps somebody who
 * is looking for a setting. This is the other half: "dogbone" and "scribe" and
 * "half lap" are things people have heard of and cannot point at, and they are
 * not the names of any control.
 */
export function searchTopics(query: string): TopicMatch[] {
  const q = loose(query);
  if (!q) return [];
  const out: TopicMatch[] = [];
  for (const topic of TOPICS) {
    const title = loose(topic.title);
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 70;
    else if (title.includes(q)) score = 50;
    else if (loose(topic.what).includes(q)) score = 30;
    else if (loose(topic.why).includes(q)) score = 20;
    if (score > 0) out.push({ topic, score });
  }
  return out.sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title));
}

import {
  MATERIAL_BACK,
  MATERIAL_STOCK,
  defaultFaceFrame,
  defaultHangingRail,
  defaultParams,
  newCabinetOfType,
  type Cabinet,
  type Carcass,
  type ProjectParams,
} from '@cabgen/core';

/**
 * Somewhere to start that is already a cabinet.
 *
 * A new project is a set of defaults, which means the first minutes go on
 * working out what the tool even makes. Each of these loads complete and
 * cuttable, and each is chosen by looking at a render of the cabinet it
 * produces — the same machinery the option galleries use, so a starter cannot
 * quietly stop matching what it loads.
 *
 * They are the *furniture* half of a project only. The workshop half — your
 * machine, your sheets, your cutter, your hinges — is kept and applied over
 * the top, because choosing a different cabinet is not a reason to re-cut it
 * to somebody else's shop. See `workshop.ts`.
 */
export interface Starter {
  id: string;
  name: string;
  /** What this one is, and what it demonstrates. One line. */
  about: string;
  build: () => ProjectParams;
}

const shelved = (over: Partial<Carcass>): Carcass => ({
  id: 'B',
  name: 'Box',
  topStyle: 'capped',
  width: 800,
  height: 800,
  depth: 400,
  linkWidthToBelow: false,
  floor: 'own',
  toeKick: { enabled: false, height: 100, setback: 50 },
  hangingRail: defaultHangingRail(),
  dividerCount: 0,
  bayWidths: [],
  bays: [{ shelves: 'none', shelfCount: 0, doors: 'none', drawerFrontHeights: [] }],
  back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
  construction: 'frameless',
  faceFrame: defaultFaceFrame(MATERIAL_STOCK),
  ...over,
});

/** The furniture replaced, the workshop left exactly as the defaults have it. */
function design(
  name: string,
  cabinets: Cabinet[],
  shape?: (p: ProjectParams) => void,
): ProjectParams {
  const p = defaultParams();
  p.name = name;
  p.cabinets = cabinets;
  shape?.(p);
  return p;
}

export const STARTERS: Starter[] = [
  {
    id: 'reference',
    name: 'The reference unit',
    about:
      'What this tool was built from: a deep base with doors under a shallower shelved box, capped top, toe kick.',
    build: () => defaultParams(),
  },
  {
    id: 'base-run',
    name: 'A run of base units',
    about:
      'Three boxes along a wall, one of them a bank of drawers. Shows how a run is laid out and nested as one job.',
    build: () =>
      design('Base run', [baseUnit('C1', 'Left'), drawerBank('C2'), baseUnit('C3', 'Right')]),
  },
  {
    id: 'wall',
    name: 'A wall cabinet',
    about:
      'Hangs over a worktop: no toe kick, shallower, and a solid hanging rail to screw it up by rather than the back panel.',
    build: () => design('Wall cabinet', [{ ...newCabinetOfType('wall', []), id: 'C1' }]),
  },
  {
    id: 'wardrobe',
    name: 'A wardrobe',
    about:
      'Floor to near ceiling, double doors, and shelves on a bored 32 mm ladder so they move later.',
    build: () =>
      design('Wardrobe', [
        {
          id: 'C1',
          name: 'Wardrobe',
          carcasses: [
            shelved({
              name: 'Wardrobe',
              width: 1000,
              height: 2100,
              depth: 600,
              toeKick: { enabled: true, height: 100, setback: 50 },
              dividerCount: 1,
              bays: [
                { shelves: 'adjustable', shelfCount: 0, doors: 'left', drawerFrontHeights: [] },
                { shelves: 'adjustable', shelfCount: 0, doors: 'right', drawerFrontHeights: [] },
              ],
            }),
          ],
        },
      ]),
  },
  {
    id: 'bookcase',
    name: 'A bookcase',
    about:
      'Open, fixed shelves, and knocked together with tab and slot — no screws, and the tabs on show as the detail.',
    build: () =>
      design(
        'Bookcase',
        [
          {
            id: 'C1',
            name: 'Bookcase',
            carcasses: [
              shelved({
                name: 'Bookcase',
                width: 800,
                height: 1600,
                depth: 300,
                topStyle: 'inset',
                bays: [{ shelves: 'fixed', shelfCount: 4, doors: 'none', drawerFrontHeights: [] }],
              }),
            ],
          },
        ],
        (p) => {
          p.joinery.carcassJoint = 'tabslot';
          // Nothing to hide the joint from, and screws would defeat the point.
          p.joinery.screwHoles = false;
        },
      ),
  },
];

/**
 * The ids are set here rather than left to `nextCabinetId`, because a starter
 * is written as a finished run: C1, C2, C3 along the wall, which is also the
 * order the part ids read in.
 */
const baseUnit = (id: string, name: string): Cabinet => ({
  ...newCabinetOfType('base', []),
  id,
  name,
});

/** A base unit fronted by drawers rather than doors, for the run above. */
function drawerBank(id: string): Cabinet {
  const cabinet = baseUnit(id, 'Drawers');
  const carcass = cabinet.carcasses[0]!;
  carcass.dividerCount = 0;
  carcass.bays = [
    { shelves: 'none', shelfCount: 0, doors: 'none', drawerFrontHeights: [180, 250, 250] },
  ];
  return cabinet;
}

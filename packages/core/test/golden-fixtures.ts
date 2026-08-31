import {
  defaultParams,
  newCabinetOfType,
  runSize,
  MATERIAL_BACK,
  MATERIAL_BANDING,
  type ProjectParams,
} from '../src/index.js';

/**
 * A small, deliberately varied set of configurations for `golden-fixtures.test.ts`.
 *
 * `golden.test.ts` pins one project — the 0.1 default — and it is dado-jointed,
 * frameless and square by construction, so it is silent about everything R-01
 * through R-09 added afterwards: tab-and-slot joinery, a rabbet back, a face
 * frame, drawers, edge banding and a crooked opening never move a single byte
 * in it no matter how badly any of them regress. Each fixture here targets one
 * or more of those paths instead.
 */
export interface GoldenFixture {
  name: string;
  build: () => ProjectParams;
}

function tabAndSlot(): ProjectParams {
  const p = defaultParams();
  p.name = 'Tab and slot demo';
  p.joinery.carcassJoint = 'tabslot';
  return p;
}

function faceFrameWithDrawers(): ProjectParams {
  const p = defaultParams();
  p.name = 'Face frame with drawers';
  const baseCabinet = newCabinetOfType('base', []);
  const wallCabinet = newCabinetOfType('wall', [baseCabinet]);
  p.cabinets = [baseCabinet, wallCabinet];

  // A drawer box side has to sit in the slide's 12-19 mm band; the carcass
  // material is 18 mm, well outside the ply the box itself is worth cutting
  // from, so this gets its own thinner sheet good, exactly as a real shop
  // would stock one.
  const drawerMaterialId = 'ply14-drawer';
  p.materials.push({
    id: drawerMaterialId,
    name: '14 mm ply',
    nominalThickness: 14,
    actualThickness: 14,
    sheets: [{ length: 2440, width: 1220 }],
    hasGrain: true,
  });
  p.drawerBoxMaterialId = drawerMaterialId;

  const base = baseCabinet.carcasses[0]!;
  base.construction = 'face-frame';
  // Bay 1 becomes a two-drawer stack; bay 2 keeps its own door, so one run
  // pins a face-frame door opening and a face-frame drawer opening side by
  // side (R-07, R-08) rather than in isolation.
  base.bays[0] = {
    shelves: 'none',
    shelfCount: 0,
    doors: 'none',
    drawerFrontHeights: [180, 220],
  };
  return p;
}

function crookedRoomWithRabbetBack(): ProjectParams {
  const p = defaultParams();
  p.name = 'Crooked room, rabbet back';
  const pantry = newCabinetOfType('tall', []);
  p.cabinets = [pantry];

  const carcass = pantry.carcasses[0]!;
  // A rabbet opens onto the rear edge rather than sitting in from it (R-01) —
  // the opposite case from the 0.1 fixture's grooved back.
  carcass.back = { style: 'rabbet', materialId: MATERIAL_BACK, inset: 0 };

  // Banded doors (R-09): every edge is cut short so gluing the tape back on
  // returns the door to the size it was designed at.
  p.edgeBanding.door = {
    edges: ['left', 'right', 'top', 'bottom'],
    materialId: MATERIAL_BANDING,
  };

  // An opening bigger than the square box in every direction — it has to be,
  // or the run does not go in at all — but not by the same amount everywhere:
  // narrower at the top than the bottom (a wall leaning in) and lower on the
  // right than the left (a sloping floor), enough to force tapered scribe
  // strips at both ends while staying comfortably inside the default 20 mm
  // scribe allowance, so it builds without a crookedness warning muddying
  // what this fixture is pinning.
  const run = runSize(p.cabinets);
  p.opening = {
    ...p.opening,
    enabled: true,
    widthAtTop: run.width + 40,
    widthAtBottom: run.width + 56,
    heightAtLeft: run.height + 30,
    heightAtRight: run.height + 15,
    // A shallow corner deviation still narrows the usable envelope over this
    // cabinet's depth (a lean drifts a return wall sideways over the run of
    // it), which is why the width margin above has to be generous too.
    cornerAngleLeft: 89,
    cornerAngleRight: 91,
    wallBow: 2,
  };
  return p;
}

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  // The tool's actual out-of-the-box default, labels included — distinct from
  // golden.test.ts's default-0.1 fixture, which turns labels off to stay
  // byte-identical to a file frozen before R-03 gave every part ID a cabinet
  // prefix.
  { name: 'everyday', build: defaultParams },
  { name: 'tab-and-slot', build: tabAndSlot },
  { name: 'face-frame-drawers', build: faceFrameWithDrawers },
  { name: 'crooked-rabbet', build: crookedRoomWithRabbetBack },
];

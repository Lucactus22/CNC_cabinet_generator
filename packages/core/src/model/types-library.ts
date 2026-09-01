import type { Cabinet, Carcass } from './types.js';
import {
  MATERIAL_BACK,
  MATERIAL_STOCK,
  defaultCabinet,
  defaultFaceFrame,
  defaultHangingRail,
  nextCabinetId,
} from './defaults.js';

/**
 * A named starting point for a cabinet.
 *
 * A type is a preset, not a class: it produces an ordinary `Cabinet` made of
 * the same carcasses every other cabinet in the run uses, just seeded with the
 * dimensions and options a woodworker would reach for by that name. Nothing
 * downstream needs to know which type built a cabinet — see
 * `build/builder.ts`, which has no branch on it.
 */
export type CabinetType = 'base' | 'wall' | 'tall' | 'stacked';

export interface CabinetTypeEntry {
  id: CabinetType;
  label: string;
  description: string;
  build: () => Cabinet;
}

/** A deep base cabinet: toe kick, a capped top forming the visible ledge, doors. */
function baseCarcass(): Carcass {
  return {
    id: 'B',
    name: 'Base',
    topStyle: 'capped',
    width: 900,
    height: 900,
    depth: 600,
    linkWidthToBelow: false,
    floor: 'own',
    toeKick: { enabled: true, height: 100, setback: 50 },
    hangingRail: defaultHangingRail(),
    dividerCount: 1,
    bayWidths: [],
    bays: [
      {
        shelves: 'adjustable',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'left',
        drawerFrontHeights: [],
      },
      {
        shelves: 'adjustable',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'right',
        drawerFrontHeights: [],
      },
    ],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
    construction: 'frameless',
    faceFrame: defaultFaceFrame(MATERIAL_STOCK),
  };
}

/**
 * A wall cabinet: no toe kick (nothing stands on the floor), shallower than a
 * base so it clears a worktop, and a hanging rail to screw it up by. See
 * `HangingRailSpec` for why the rail exists rather than screwing through the
 * back panel directly.
 */
function wallCarcass(): Carcass {
  return {
    id: 'B',
    name: 'Wall',
    topStyle: 'inset',
    width: 900,
    height: 700,
    // 12-13 in (300-330 mm) is standard wall-cabinet depth; 325 mm splits it.
    depth: 325,
    linkWidthToBelow: false,
    floor: 'own',
    toeKick: { enabled: false, height: 100, setback: 50 },
    hangingRail: { ...defaultHangingRail(), enabled: true },
    dividerCount: 1,
    bayWidths: [],
    bays: [
      {
        shelves: 'adjustable',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'left',
        drawerFrontHeights: [],
      },
      {
        shelves: 'adjustable',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'right',
        drawerFrontHeights: [],
      },
    ],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
    construction: 'frameless',
    faceFrame: defaultFaceFrame(MATERIAL_STOCK),
  };
}

/** A tall pantry: floor to near ceiling, a single column of fixed shelves behind a pair of doors. */
function tallCarcass(): Carcass {
  return {
    id: 'B',
    name: 'Pantry',
    topStyle: 'capped',
    width: 600,
    height: 2100,
    depth: 580,
    linkWidthToBelow: false,
    floor: 'own',
    toeKick: { enabled: true, height: 100, setback: 50 },
    hangingRail: defaultHangingRail(),
    dividerCount: 0,
    bayWidths: [],
    bays: [
      { shelves: 'fixed', shelfCount: 5, shelfGaps: [], doors: 'double', drawerFrontHeights: [] },
    ],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
    construction: 'frameless',
    faceFrame: defaultFaceFrame(MATERIAL_STOCK),
  };
}

export const CABINET_TYPES: CabinetTypeEntry[] = [
  {
    id: 'base',
    label: 'Base',
    description:
      'Stands on the floor: a toe kick, a capped top, doors over an open or shelved bay.',
    build: () => ({ id: '', name: 'Base cabinet', carcasses: [baseCarcass()] }),
  },
  {
    id: 'wall',
    label: 'Wall',
    description: 'Hangs above a worktop: no toe kick, shallower, a hanging rail to screw it up by.',
    build: () => ({ id: '', name: 'Wall cabinet', carcasses: [wallCarcass()] }),
  },
  {
    id: 'tall',
    label: 'Tall / pantry',
    description: 'Floor to near ceiling, a single column of fixed shelves behind double doors.',
    build: () => ({ id: '', name: 'Tall unit', carcasses: [tallCarcass()] }),
  },
  {
    id: 'stacked',
    label: 'Stacked (base + upper)',
    description: 'The 0.1 default: a deep base with a shallower shelved box on top of it.',
    build: () => defaultCabinet(),
  },
];

/** A fresh cabinet of the given type, with an id nothing else in the run has claimed. */
export function newCabinetOfType(type: CabinetType, existing: Cabinet[]): Cabinet {
  const entry = CABINET_TYPES.find((t) => t.id === type) ?? CABINET_TYPES[0]!;
  return { ...entry.build(), id: nextCabinetId(existing) };
}

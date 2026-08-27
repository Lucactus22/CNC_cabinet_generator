import type { Cabinet, Carcass, ProjectParams, Material } from './types.js';

export const MATERIAL_CARCASS = 'ply18';
export const MATERIAL_BACK = 'ply12';

export function defaultMaterials(): Material[] {
  return [
    {
      id: MATERIAL_CARCASS,
      name: '18 mm birch plywood',
      nominalThickness: 18,
      // Sheet goods are almost never their nominal size. Measure yours.
      actualThickness: 17.8,
      sheetLength: 2440,
      sheetWidth: 1220,
      hasGrain: true,
    },
    {
      id: MATERIAL_BACK,
      name: '12 mm birch plywood',
      nominalThickness: 12,
      actualThickness: 11.9,
      sheetLength: 2440,
      sheetWidth: 1220,
      hasGrain: true,
    },
  ];
}

/**
 * The base carcass of the unit in the reference photographs: a deep box with
 * doors, a toe kick, and a capped top that forms the visible ledge.
 */
export function defaultBaseCarcass(): Carcass {
  return {
    id: 'B',
    name: 'Base',
    // The base's top is the visible ledge, so it laps over the sides.
    topStyle: 'capped',
    width: 900,
    height: 900,
    depth: 600,
    linkWidthToBelow: false,
    floor: 'own',
    toeKick: { enabled: true, height: 100, setback: 50 },
    dividerCount: 1,
    bayWidths: [],
    bays: [
      { shelves: 'none', shelfCount: 0, doors: 'left' },
      { shelves: 'fixed', shelfCount: 1, doors: 'right' },
    ],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
  };
}

/** The shallower shelved box that sits on the base. */
export function defaultUpperCarcass(): Carcass {
  return {
    id: 'T',
    name: 'Upper',
    topStyle: 'inset',
    width: 900,
    height: 1100,
    depth: 400,
    linkWidthToBelow: true,
    floor: 'own',
    toeKick: { enabled: false, height: 100, setback: 50 },
    dividerCount: 1,
    bayWidths: [],
    bays: [
      { shelves: 'fixed', shelfCount: 4, doors: 'none' },
      { shelves: 'adjustable', shelfCount: 0, doors: 'none' },
    ],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
  };
}

export function defaultCabinet(): Cabinet {
  return {
    id: 'C1',
    name: 'Stacked unit',
    carcasses: [defaultBaseCarcass(), defaultUpperCarcass()],
  };
}

/**
 * A short token for a carcass, in the order the trade names them: the box on
 * the floor is the base, everything above it is an upper.
 *
 * The token lands in every part ID the carcass produces, so it has to be unique
 * within its cabinet — two carcasses called 'T' would put two different panels
 * on the same engraved label.
 */
export function nextCarcassId(existing: Carcass[]): string {
  const taken = new Set(existing.map((c) => c.id));
  const stem = existing.length === 0 ? 'B' : 'T';
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}${n}`)) return `${stem}${n}`;
}

export function nextCabinetId(existing: Cabinet[]): string {
  const taken = new Set(existing.map((c) => c.id));
  for (let n = 1; ; n++) if (!taken.has(`C${n}`)) return `C${n}`;
}

/**
 * A carcass to add to a stack: the same box as the one below it, emptied out.
 *
 * Copying the dimensions rather than starting from a fixed size is what someone
 * stacking a second box actually wants, and it keeps the stack flush by
 * default.
 */
export function newCarcass(existing: Carcass[]): Carcass {
  const below = existing[existing.length - 1];
  const id = nextCarcassId(existing);
  return {
    id,
    // Base, then Upper, then Upper 2 — the way a stack gets talked about,
    // rather than an 'Upper 1' with no Upper to be the first of.
    name:
      existing.length === 0 ? 'Base' : existing.length === 1 ? 'Upper' : `Upper ${existing.length}`,
    topStyle: 'inset',
    width: below?.width ?? 900,
    height: 700,
    depth: below?.depth ?? 400,
    linkWidthToBelow: existing.length > 0,
    floor: 'own',
    toeKick: { enabled: false, height: 100, setback: 50 },
    dividerCount: 0,
    bayWidths: [],
    bays: [{ shelves: 'adjustable', shelfCount: 0, doors: 'none' }],
    back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
  };
}

/** A fresh cabinet for the end of the run. */
export function newCabinet(existing: Cabinet[]): Cabinet {
  const id = nextCabinetId(existing);
  return { id, name: `Cabinet ${existing.length + 1}`, carcasses: [defaultBaseCarcass()] };
}

/**
 * Copy a cabinet under a new id.
 *
 * Every part ID starts with the cabinet id, so a duplicate that kept the
 * original's id would collide on every single panel.
 *
 * Copied field by field rather than through a host clone: the core has no
 * runtime dependencies and no globals to lean on, and the arrays here are the
 * ones a shared reference would quietly corrupt — edit a bay in the copy and
 * watch it change in the original.
 */
export function duplicateCabinet(source: Cabinet, existing: Cabinet[]): Cabinet {
  return {
    id: nextCabinetId(existing),
    name: `${source.name} copy`,
    carcasses: source.carcasses.map(copyCarcass),
  };
}

export function copyCarcass(source: Carcass): Carcass {
  return {
    ...source,
    bayWidths: [...source.bayWidths],
    bays: source.bays.map((b) => ({ ...b })),
    back: { ...source.back },
    toeKick: { ...source.toeKick },
  };
}

/**
 * A unit close to the reference photographs: a deeper base with drawers/doors
 * below and a shallower shelved upper sitting straight on top of it.
 */
export function defaultParams(): ProjectParams {
  return {
    name: 'Stacked built-in',
    materials: defaultMaterials(),
    carcassMaterialId: MATERIAL_CARCASS,
    shelfMaterialId: MATERIAL_CARCASS,
    tool: {
      diameter: 6,
      drillDiameter: 5,
    },
    machine: {
      travelX: 1000,
      travelY: 1000,
      travelZ: 100,
      tilingAxis: 'x',
      tileOverlap: 20,
      registrationHoleDiameter: 6,
    },
    joinery: {
      carcassJoint: 'dado',
      reliefStyle: 'dogbone',
      fitClearance: 0.15,
      dadoDepth: 6,
      dadoStopFront: 10,
      screwHoles: true,
      screwClearanceDiameter: 4.5,
      screwSpacing: 150,
      tabWidth: 40,
      tabMinCount: 3,
      stackDadoDepth: 4,
      shelfPin: {
        diameter: 5,
        depth: 12,
        pitch: 32,
        frontOffset: 37,
        backOffset: 37,
        startAbove: 100,
        endBelow: 100,
      },
    },
    doors: {
      fit: 'overlay',
      materialId: MATERIAL_CARCASS,
      reveal: 3,
      insetGap: 2,
    },
    // The IKEA UTRUSTA pattern, which is Blum's.
    hinge: {
      cupDiameter: 35,
      cupDepth: 13,
      boringDistance: 5,
      dowelDiameter: 8,
      dowelSpacing: 45,
      dowelOffset: 9.5,
      dowelDepth: 12,
      endOffset: 76.2,
      plateHoleDiameter: 5,
      plateHoleDepth: 12,
      plateHoleSpacing: 32,
      plateFrontOffset: 37,
    },
    cabinets: [defaultCabinet()],
    nesting: {
      // Fewer setups beats a few percent of yield on a machine that has to
      // feed its stock through. It makes no difference when nothing tiles.
      strategy: 'tiling',
      sheetMargin: 10,
      partGap: 2,
      allowRotation: true,
    },
    // Panelling and the like: none by default, added from the Surface effects
    // panel and applied to whichever face you pick.
    surfaceEffects: [],
    labelParts: true,
  };
}

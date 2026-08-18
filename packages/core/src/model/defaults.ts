import type { CabinetParams, Material } from './types.js';

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
 * A unit close to the reference photographs: a deeper base with drawers/doors
 * below and a shallower shelved upper sitting straight on top of it.
 */
export function defaultParams(): CabinetParams {
  return {
    name: 'Stacked built-in',
    units: 'mm',
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
      screwPilotDiameter: 4.5,
      screwSpacing: 150,
      tabWidth: 40,
      tabMinCount: 3,
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
    base: {
      width: 900,
      height: 900,
      depth: 600,
      dividerCount: 1,
      bayWidths: [],
      bays: [
        { shelves: 'none', shelfCount: 0 },
        { shelves: 'fixed', shelfCount: 1 },
      ],
      back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
      toeKick: { enabled: true, height: 100, setback: 50 },
    },
    top: {
      width: 900,
      height: 1100,
      depth: 400,
      linkWidthToBase: true,
      dividerCount: 1,
      bayWidths: [],
      bays: [
        { shelves: 'fixed', shelfCount: 4 },
        { shelves: 'adjustable', shelfCount: 0 },
      ],
      back: { style: 'groove', materialId: MATERIAL_BACK, inset: 12 },
    },
    nesting: {
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

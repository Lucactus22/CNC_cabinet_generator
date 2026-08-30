import { defaultCabinet, defaultParams } from './defaults.js';
import {
  HINGE_UTRUSTA,
  PIN_5MM,
  readEntry,
  type HardwareEntry,
  type HardwareSelection,
  type HingeSpec,
  type ShelfPinBoring,
} from '../hardware/catalogue.js';
import type {
  Cabinet,
  Carcass,
  ProjectParams,
  ShelfPinSpec,
  SurfaceEffectSpec,
  SurfaceTarget,
} from './types.js';

/**
 * Fill in anything a project file is missing.
 *
 * Saved projects outlive the shape of the model: a file written before surface
 * effects existed has no `surfaceEffects`, one written before the screw
 * clearance hole was named properly still calls it a pilot hole, and one
 * written before R-03 has two hardcoded carcasses called `base` and `top`
 * instead of a run of cabinets. Merging over the defaults means an old file
 * opens and works rather than producing NaNs halfway through the geometry.
 */
export function normaliseParams(raw: unknown): ProjectParams {
  const base = defaultParams();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Record<string, unknown>;

  const merged: ProjectParams = {
    ...base,
    ...(input as Partial<ProjectParams>),
    tool: { ...base.tool, ...(input.tool as object) },
    machine: { ...base.machine, ...(input.machine as object) },
    nesting: { ...base.nesting, ...(input.nesting as object) },
    doors: { ...base.doors, ...(input.doors as object) },
    hardware: readHardware(input, base),
    joinery: {
      ...base.joinery,
      ...(input.joinery as object),
      shelfPin: readPinLayout(input, base.joinery.shelfPin),
    },
    cabinets: readCabinets(input),
    // A file written before R-05 has no measured room at all, and must open as
    // a project that simply has not been measured yet. The corner triangles are
    // spread through as-is: absent means the angle was typed rather than
    // measured, which is a real distinction and not a missing default.
    opening: {
      ...base.opening,
      ...(input.opening as object),
      scribe: {
        ...base.opening.scribe,
        ...((input.opening as Record<string, unknown>)?.scribe as object),
      },
    },
    materials:
      Array.isArray(input.materials) && input.materials.length > 0
        ? (input.materials as ProjectParams['materials'])
        : base.materials,
    // A file written before R-07 has no stock list at all, because nothing
    // needed one: it opens with the one this project ships by default.
    stockMaterials:
      Array.isArray(input.stockMaterials) && input.stockMaterials.length > 0
        ? (input.stockMaterials as ProjectParams['stockMaterials'])
        : base.stockMaterials,
    // A file written before R-09 has no banding material either, but unlike
    // the stock list an empty one is a real, common state — nobody has to
    // band anything — so an explicitly emptied list is respected rather than
    // snapped back to the default roll.
    bandingMaterials: Array.isArray(input.bandingMaterials)
      ? (input.bandingMaterials as ProjectParams['bandingMaterials'])
      : base.bandingMaterials,
    // Same file has no rules at all, which reads exactly as it should: no role
    // was ever banded, so none is now either.
    edgeBanding: { ...base.edgeBanding, ...(input.edgeBanding as object) },
    surfaceEffects: Array.isArray(input.surfaceEffects)
      ? (input.surfaceEffects as SurfaceEffectSpec[]).map(migrateEffect)
      : [],
  };

  // A hand-edited file can name a scribe material nothing in the list answers
  // to, which would leave the strips silently absent. Fall back to the carcass
  // material so the project opens with something that can actually be cut.
  if (!merged.materials.some((m) => m.id === merged.opening.scribe.materialId)) {
    merged.opening.scribe.materialId = merged.carcassMaterialId;
  }

  // Older files called the clearance hole a pilot hole.
  const legacy = (input.joinery as Record<string, unknown>)?.screwPilotDiameter;
  if (typeof legacy === 'number' && legacy > 0) merged.joinery.screwClearanceDiameter = legacy;

  return dedupeIds(merged);
}

/**
 * Which hardware a project is cut to.
 *
 * Before the catalogue, the hinge's dimensions and the shelf pin's were fields
 * on the project itself. A file written then has to keep cutting the same
 * holes, so numbers that match a built-in select that entry, and numbers that
 * do not become an entry of the project's own. Quietly snapping a hinge
 * somebody had dialled in back to the default would ruin their doors.
 */
function readHardware(input: Record<string, unknown>, base: ProjectParams): HardwareSelection {
  const raw = input.hardware as Partial<HardwareSelection> | undefined;
  const selection: HardwareSelection = {
    ...base.hardware,
    ...(raw ?? {}),
    // Read rather than trusted: an entry with a hole in it would otherwise
    // reach the boring code and take the whole pipeline down with it.
    custom: Array.isArray(raw?.custom)
      ? raw.custom.map(readEntry).filter((e): e is HardwareEntry => e !== null)
      : [],
    handlePlacement: {
      ...base.hardware.handlePlacement,
      ...((raw?.handlePlacement ?? {}) as object),
    },
  };
  // A file that already names its hardware says everything there is to say.
  if (raw) return selection;

  const legacyHinge = input.hinge as Partial<HingeSpec> | undefined;
  if (legacyHinge) {
    const boring: HingeSpec = { ...HINGE_UTRUSTA.boring, ...legacyHinge };
    if (!same(boring, HINGE_UTRUSTA.boring)) {
      selection.hingeId = 'project-hinge';
      selection.custom.push({
        kind: 'hinge',
        id: 'project-hinge',
        name: 'Hinge from this project',
        source: 'Carried over from a project saved before hardware was a catalogue.',
        boring,
        // The old code accepted 3-8 mm whatever the hinge was, so that is the
        // range this project was working to and the one it keeps.
        boringDistanceRange: { min: 3, max: 8 },
        // Copied, not shared: this entry is editable, and a shared rule object
        // would let editing it rewrite the shipped hinge for every project
        // opened afterwards in the same process.
        requires: HINGE_UTRUSTA.requires.map((r) => ({ ...r })),
        custom: true,
      });
    }
  }

  const legacyPin = (input.joinery as Record<string, unknown>)?.shelfPin as
    Partial<ShelfPinBoring> | undefined;
  if (legacyPin) {
    const boring: ShelfPinBoring = {
      diameter: legacyPin.diameter ?? PIN_5MM.boring.diameter,
      depth: legacyPin.depth ?? PIN_5MM.boring.depth,
      pitch: legacyPin.pitch ?? PIN_5MM.boring.pitch,
    };
    if (!same(boring, PIN_5MM.boring)) {
      selection.shelfPinId = 'project-shelf-pin';
      selection.custom.push({
        kind: 'shelf-pin',
        id: 'project-shelf-pin',
        name: 'Shelf pin from this project',
        source: 'Carried over from a project saved before hardware was a catalogue.',
        boring,
        requires: PIN_5MM.requires.map((r) => ({ ...r })),
        custom: true,
      });
    }
  }

  return selection;
}

/** Only the layout half of the old shelf pin block is still a joinery setting. */
function readPinLayout(input: Record<string, unknown>, base: ShelfPinSpec): ShelfPinSpec {
  const raw = ((input.joinery as Record<string, unknown>)?.shelfPin ?? {}) as Partial<ShelfPinSpec>;
  return {
    frontOffset: raw.frontOffset ?? base.frontOffset,
    backOffset: raw.backOffset ?? base.backOffset,
    startAbove: raw.startAbove ?? base.startAbove,
    endBelow: raw.endBelow ?? base.endBelow,
  };
}

/** Whether a legacy block holds exactly the numbers a built-in entry does. */
function same<T extends object>(a: T, b: T): boolean {
  return (Object.keys(b) as Array<keyof T>).every((k) => a[k] === b[k]);
}

/** The cabinet list, or the pre-R-03 pair of carcasses turned into one. */
function readCabinets(input: Record<string, unknown>): Cabinet[] {
  if (Array.isArray(input.cabinets)) {
    return (input.cabinets as Cabinet[]).map((c, i) => normaliseCabinet(c, i));
  }
  if (input.base || input.top) return [migrateStackedUnit(input)];
  return [defaultCabinet()];
}

/**
 * A 0.1 file: one cabinet made of the two carcasses it hardcoded.
 *
 * The ids have to come out as `B` and `T`, because a 0.1 file's surface effects
 * name their carcass as 'base' or 'top' and its part-targeted effects name
 * panels like `B-BACK`.
 */
function migrateStackedUnit(input: Record<string, unknown>): Cabinet {
  const template = defaultCabinet();
  const carcasses: Carcass[] = [];

  const legacyBase = input.base as Record<string, unknown> | undefined;
  if (legacyBase) {
    carcasses.push(
      mergeCarcass(template.carcasses[0]!, { ...legacyBase, id: 'B', name: 'Base', floor: 'own' }),
    );
  }

  const legacyTop = input.top as Record<string, unknown> | undefined;
  if (legacyTop) {
    carcasses.push(
      mergeCarcass(template.carcasses[1]!, {
        ...legacyTop,
        id: 'T',
        name: 'Upper',
        // Both fields were named for the two carcasses that no longer exist.
        linkWidthToBelow: legacyTop.linkWidthToBase ?? true,
        floor: legacyTop.floor === 'base-top' ? 'below' : 'own',
        toeKick: { enabled: false, height: 100, setback: 50 },
      }),
    );
  }

  return { ...template, carcasses };
}

function normaliseCabinet(raw: Cabinet, index: number): Cabinet {
  const template = defaultCabinet();
  const carcasses = Array.isArray(raw?.carcasses) ? raw.carcasses : [];
  return {
    id: raw?.id || `C${index + 1}`,
    name: raw?.name || `Cabinet ${index + 1}`,
    carcasses: carcasses.map((c, i) =>
      mergeCarcass(template.carcasses[Math.min(i, template.carcasses.length - 1)]!, {
        ...(c as unknown as Record<string, unknown>),
        id: c?.id || (i === 0 ? 'B' : `T${i > 1 ? i : ''}`),
      }),
    ),
  };
}

function mergeCarcass(template: Carcass, raw: Record<string, unknown>): Carcass {
  return {
    ...template,
    ...(raw as Partial<Carcass>),
    back: { ...template.back, ...(raw.back as object) },
    toeKick: { ...template.toeKick, ...(raw.toeKick as object) },
    hangingRail: { ...template.hangingRail, ...(raw.hangingRail as object) },
    // A file written before R-07 has no faceFrame block at all: it opens
    // frameless, exactly as it was cut, with sensible numbers already sitting
    // there the moment someone switches it on.
    faceFrame: { ...template.faceFrame, ...(raw.faceFrame as object) },
    bays: Array.isArray(raw.bays) ? (raw.bays as Carcass['bays']) : template.bays,
    bayWidths: Array.isArray(raw.bayWidths) ? (raw.bayWidths as number[]) : [],
  };
}

/**
 * Bring a 0.1 effect target up to date.
 *
 * `carcass: 'base' | 'top' | 'both'` became a pair of optional ids, and every
 * part gained a cabinet prefix. Left alone, a saved beadboard back would
 * silently match nothing and the panel would come out plain.
 */
function migrateEffect(spec: SurfaceEffectSpec): SurfaceEffectSpec {
  const target = spec.target as SurfaceTarget & { carcass?: string };
  if (target.select === 'part' && !target.partId.startsWith('C')) {
    return { ...spec, target: { select: 'part', partId: `C1-${target.partId}` } };
  }
  if (target.select === 'role' && target.carcass !== undefined) {
    // 'both' meant every carcass in the only cabinet there was, which is what an
    // unqualified role target means now. Pinning it to C1 instead would leave it
    // naming a scope the picker cannot offer.
    const carcassId = target.carcass === 'base' ? 'B' : target.carcass === 'top' ? 'T' : undefined;
    return {
      ...spec,
      target: {
        select: 'role',
        role: target.role,
        ...(carcassId ? { cabinetId: 'C1', carcassId } : {}),
      },
    };
  }
  return spec;
}

/**
 * Make every id unique before anything is built from it.
 *
 * Ids are the first two fields of every part ID, so a hand-edited file with two
 * cabinets called `C1` would put two different panels on the same engraved
 * label and hand the nester a map with one of them missing. The diagnostics
 * report a collision too, for anything that gets past here.
 */
function dedupeIds(params: ProjectParams): ProjectParams {
  const takenCabinets = new Set<string>();
  params.cabinets = params.cabinets.map((cabinet, i) => {
    const id = unique(cabinet.id || `C${i + 1}`, takenCabinets);
    const takenCarcasses = new Set<string>();
    return {
      ...cabinet,
      id,
      carcasses: cabinet.carcasses.map((carcass, k) => ({
        ...carcass,
        id: unique(carcass.id || (k === 0 ? 'B' : 'T'), takenCarcasses),
      })),
    };
  });
  return params;
}

function unique(wanted: string, taken: Set<string>): string {
  let id = wanted;
  for (let n = 2; taken.has(id); n++) id = `${wanted}-${n}`;
  taken.add(id);
  return id;
}

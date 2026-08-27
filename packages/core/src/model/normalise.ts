import { defaultCabinet, defaultParams } from './defaults.js';
import type { Cabinet, Carcass, ProjectParams, SurfaceEffectSpec, SurfaceTarget } from './types.js';

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
    hinge: { ...base.hinge, ...(input.hinge as object) },
    joinery: {
      ...base.joinery,
      ...(input.joinery as object),
      shelfPin: {
        ...base.joinery.shelfPin,
        ...((input.joinery as Record<string, unknown>)?.shelfPin as object),
      },
    },
    cabinets: readCabinets(input),
    materials:
      Array.isArray(input.materials) && input.materials.length > 0
        ? (input.materials as ProjectParams['materials'])
        : base.materials,
    surfaceEffects: Array.isArray(input.surfaceEffects)
      ? (input.surfaceEffects as SurfaceEffectSpec[]).map(migrateEffect)
      : [],
  };

  // Older files called the clearance hole a pilot hole.
  const legacy = (input.joinery as Record<string, unknown>)?.screwPilotDiameter;
  if (typeof legacy === 'number' && legacy > 0) merged.joinery.screwClearanceDiameter = legacy;

  return dedupeIds(merged);
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

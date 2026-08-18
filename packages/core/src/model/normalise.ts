import { defaultParams } from './defaults.js';
import type { CabinetParams } from './types.js';

/**
 * Fill in anything a project file is missing.
 *
 * Saved projects outlive the shape of the model: a file written before surface
 * effects existed has no `surfaceEffects`, and one written before the screw
 * clearance hole was named properly still calls it a pilot hole. Merging over
 * the defaults means an old file opens and works rather than producing NaNs
 * halfway through the geometry.
 */
export function normaliseParams(raw: unknown): CabinetParams {
  const base = defaultParams();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Record<string, unknown>;

  const merged: CabinetParams = {
    ...base,
    ...(input as Partial<CabinetParams>),
    tool: { ...base.tool, ...(input.tool as object) },
    machine: { ...base.machine, ...(input.machine as object) },
    nesting: { ...base.nesting, ...(input.nesting as object) },
    joinery: {
      ...base.joinery,
      ...(input.joinery as object),
      shelfPin: {
        ...base.joinery.shelfPin,
        ...((input.joinery as Record<string, unknown>)?.shelfPin as object),
      },
    },
    base: {
      ...base.base,
      ...(input.base as object),
      back: { ...base.base.back, ...((input.base as Record<string, unknown>)?.back as object) },
      toeKick: {
        ...base.base.toeKick,
        ...((input.base as Record<string, unknown>)?.toeKick as object),
      },
    },
    top: {
      ...base.top,
      ...(input.top as object),
      back: { ...base.top.back, ...((input.top as Record<string, unknown>)?.back as object) },
    },
    materials: Array.isArray(input.materials) && input.materials.length > 0
      ? (input.materials as CabinetParams['materials'])
      : base.materials,
    surfaceEffects: Array.isArray(input.surfaceEffects)
      ? (input.surfaceEffects as CabinetParams['surfaceEffects'])
      : [],
  };

  // Older files called the clearance hole a pilot hole.
  const legacy = (input.joinery as Record<string, unknown>)?.screwPilotDiameter;
  if (typeof legacy === 'number' && legacy > 0) merged.joinery.screwClearanceDiameter = legacy;

  return merged;
}

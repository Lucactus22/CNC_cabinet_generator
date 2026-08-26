import type { Carcass, ProjectParams } from '../src/index.js';

/**
 * Reach a carcass of the default project by the name a woodworker uses.
 *
 * Before R-03 these were `params.base` and `params.top`, two fields the model
 * hardcoded. They are now the two carcasses of the one default cabinet, and the
 * tests say so through here rather than indexing arrays: a test that fails
 * because a carcass moved in a list is a test about the list, not about the
 * plywood.
 */
export const base = (p: ProjectParams): Carcass => carcass(p, 'B');
export const upper = (p: ProjectParams): Carcass => carcass(p, 'T');

export function carcass(p: ProjectParams, id: string, cabinetIndex = 0): Carcass {
  const found = p.cabinets[cabinetIndex]?.carcasses.find((c) => c.id === id);
  if (!found) throw new Error(`No carcass '${id}' in cabinet ${cabinetIndex} of '${p.name}'.`);
  return found;
}

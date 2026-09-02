import type { ProjectResult } from '@cabgen/core';

/**
 * Where a job stands at the machine: which assembly step is open, and which
 * parts have been marked cut. Kept apart from `params` and from undo/redo —
 * it describes progress on the *current* run of the design, not the design
 * itself, and undoing a dimension mid-job should not also un-cut a sheet.
 */
export interface MachineProgress {
  /** See `cutListSignature` — what this progress was recorded against. */
  signature: string;
  step: number;
  cut: string[];
}

export const emptyMachineProgress = (): MachineProgress => ({ signature: '', step: 0, cut: [] });

/**
 * A fingerprint of what a project's cut list actually contains — sheet parts
 * and solid stock alike, since `AtMachine.tsx`'s cutting checklist shows and
 * checks off both.
 *
 * Part ids are structural (`C1-B-SIDE-L`), not content-hashed, so two
 * different projects — or the same project before and after an edit — can
 * easily share an id, and an edit that resizes an *existing* panel does not
 * change its id at all: a cabinet made wider still calls its side
 * `C1-B-SIDE-L`, just bigger. An id-only fingerprint would miss exactly that
 * case, so each part's blank size is folded in too. Progress kept under the
 * wrong signature would tick a part as already cut that has, in truth, just
 * changed size underneath that checkmark: the paperwork equivalent of the
 * silently wrong cabinet `CLAUDE.md` calls this codebase's worst failure.
 * Comparing signatures is what lets stale progress be noticed and set aside
 * rather than silently misapplied — see `activeMachineProgress` in store.ts.
 */
export function cutListSignature(project: ProjectResult): string {
  return [...project.cutList, ...project.stockCutList]
    .map((r) => `${r.id}:${r.length}x${r.width}x${r.thickness}`)
    .sort()
    .join('|');
}

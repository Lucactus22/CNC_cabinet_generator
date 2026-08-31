import type { Cabinet, Carcass, Part, ProjectParams } from '@cabgen/core';

/**
 * What the inspector is pointed at.
 *
 * Selection always resolves: nothing narrower means the run is selected, so
 * there is no empty inspector to design and no state where the shell has
 * nothing to say. See docs/UX.md, "The architectural questions", 1.
 */
export type Selection =
  | { kind: 'run' }
  | { kind: 'cabinet'; cabinetId: string }
  | { kind: 'carcass'; cabinetId: string; carcassId: string }
  | { kind: 'bay'; cabinetId: string; carcassId: string; bay: number }
  | { kind: 'part'; partId: string };

export const RUN: Selection = { kind: 'run' };

/** The cabinet a selection sits in, if it names one. */
export function cabinetIdOf(sel: Selection, parts: Part[]): string | null {
  if (sel.kind === 'run') return null;
  if (sel.kind === 'part') return parts.find((p) => p.id === sel.partId)?.cabinetId ?? null;
  return sel.cabinetId;
}

export function carcassIdOf(sel: Selection, parts: Part[]): string | null {
  if (sel.kind === 'run' || sel.kind === 'cabinet') return null;
  if (sel.kind === 'part') return parts.find((p) => p.id === sel.partId)?.carcassId ?? null;
  return sel.carcassId;
}

export const findCabinet = (params: ProjectParams, id: string | null): Cabinet | undefined =>
  id === null ? undefined : params.cabinets.find((c) => c.id === id);

export const findCarcass = (
  cabinet: Cabinet | undefined,
  id: string | null,
): Carcass | undefined => (id === null ? undefined : cabinet?.carcasses.find((k) => k.id === id));

/**
 * Narrow a selection back to something that still exists.
 *
 * Removing the selected carcass, undoing back past a bay's existence, or
 * opening a different project would otherwise leave the inspector pointed at
 * an id nothing answers to. Falling back up the hierarchy — bay to carcass to
 * cabinet to run — keeps the user near where they were rather than dumping
 * them at the top of the project.
 */
export function settleSelection(params: ProjectParams, parts: Part[], sel: Selection): Selection {
  if (sel.kind === 'run') return sel;
  if (sel.kind === 'part') {
    return parts.some((p) => p.id === sel.partId) ? sel : RUN;
  }
  const cabinet = findCabinet(params, sel.cabinetId);
  if (!cabinet) return RUN;
  if (sel.kind === 'cabinet') return sel;
  const carcass = findCarcass(cabinet, sel.carcassId);
  if (!carcass) return { kind: 'cabinet', cabinetId: cabinet.id };
  if (sel.kind === 'carcass') return sel;
  const bays = carcass.dividerCount + 1;
  if (sel.bay >= bays) return { kind: 'carcass', cabinetId: cabinet.id, carcassId: carcass.id };
  return sel;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'run':
      return true;
    case 'cabinet':
      return a.cabinetId === (b as typeof a).cabinetId;
    case 'carcass':
      return a.cabinetId === (b as typeof a).cabinetId && a.carcassId === (b as typeof a).carcassId;
    case 'bay':
      return (
        a.cabinetId === (b as typeof a).cabinetId &&
        a.carcassId === (b as typeof a).carcassId &&
        a.bay === (b as typeof a).bay
      );
    case 'part':
      return a.partId === (b as typeof a).partId;
  }
}

export interface Crumb {
  label: string;
  to: Selection;
}

/**
 * The route back up the hierarchy, as the inspector's own heading.
 *
 * `Run › C1 Stacked unit › Base › Bay 2` — the vocabulary the model already
 * uses, so nothing has to be learned to navigate it.
 */
export function breadcrumb(params: ProjectParams, parts: Part[], sel: Selection): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Run', to: RUN }];
  const cabinet = findCabinet(params, cabinetIdOf(sel, parts));
  if (!cabinet) return crumbs;
  crumbs.push({ label: cabinet.name, to: { kind: 'cabinet', cabinetId: cabinet.id } });

  const carcass = findCarcass(cabinet, carcassIdOf(sel, parts));
  if (!carcass) return crumbs;
  crumbs.push({
    label: carcass.name,
    to: { kind: 'carcass', cabinetId: cabinet.id, carcassId: carcass.id },
  });

  if (sel.kind === 'bay') {
    crumbs.push({ label: `Bay ${sel.bay + 1}`, to: sel });
  } else if (sel.kind === 'part') {
    const part = parts.find((p) => p.id === sel.partId);
    if (part) crumbs.push({ label: part.label, to: sel });
  }
  return crumbs;
}

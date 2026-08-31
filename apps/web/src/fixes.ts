import { buildProject, type ProjectParams, type ProjectResult } from '@cabgen/core';

/**
 * A way out of a blocking diagnostic, checked before it is offered.
 *
 * R-16 found the worst thing in the app here: on a fresh project the only fix
 * the interface offers for its only blocking errors — *Set sheets to machine
 * size* — trades two errors for a different blocking error whose hint
 * contradicts the button that was just pressed, and export stays disabled
 * either way. The route that works is the other half of the same diagnostic's
 * sentence and is offered nowhere.
 *
 * So every candidate here is *run* before it is shown: the parameters it would
 * produce go through the whole pipeline, and a candidate that does not clear
 * what it claims to — or that raises a new error of its own — is not offered
 * at all. What it costs in sheets and yield is read off the same build, so the
 * price is on the button rather than discovered afterwards.
 *
 * R-21 generalises this to every diagnostic that names a parameter. This is
 * the narrow version J6 needs: the errors that block export.
 */
export interface Candidate {
  id: string;
  label: string;
  apply: (p: ProjectParams) => void;
}

export interface OfferedFix extends Candidate {
  /** What it costs, in the workshop's own terms. Empty when it costs nothing. */
  cost: string;
  errorsBefore: number;
  errorsAfter: number;
}

const errorsIn = (p: ProjectResult): number =>
  p.diagnostics.filter((d) => d.severity === 'error').length;

const sheetsIn = (p: ProjectResult): number => p.nest.sheets.length;

const yieldIn = (p: ProjectResult): number =>
  p.nest.sheets.length === 0
    ? 1
    : p.nest.sheets.reduce((a, s) => a + s.yield, 0) / p.nest.sheets.length;

/** Travel on the axis that never moves, however the stock is fed through. */
const crossFeedTravel = (p: ProjectParams): number =>
  p.machine.tilingAxis === 'none'
    ? p.machine.travelY
    : p.machine.tilingAxis === 'x'
      ? p.machine.travelY
      : p.machine.travelX;

function candidates(params: ProjectParams): Candidate[] {
  const across = crossFeedTravel(params);
  return [
    {
      id: 'rip-to-travel',
      label: `Rip the sheets to ${across.toFixed(0)} mm across the feed`,
      apply: (p) => {
        for (const m of p.materials) {
          for (const size of m.sheets) {
            // A remnant's size is what is physically on the shelf; only the
            // standard sizes are something a merchant can cut to order.
            if (size.quantity === undefined) size.width = Math.min(size.width, across);
          }
        }
      },
    },
    {
      id: 'bed-size',
      label: 'Set the sheets to the size of the bed',
      apply: (p) => {
        for (const m of p.materials) {
          const standard = m.sheets.find((s) => s.quantity === undefined);
          if (standard) {
            standard.length = p.machine.travelX;
            standard.width = p.machine.travelY;
          } else {
            m.sheets.push({ length: p.machine.travelX, width: p.machine.travelY });
          }
        }
      },
    },
    {
      id: 'feed-other-way',
      label: 'Feed the stock through the other way',
      apply: (p) => {
        p.machine.tilingAxis = p.machine.tilingAxis === 'y' ? 'x' : 'y';
      },
    },
  ];
}

/**
 * Every candidate that actually clears blocking errors, with its cost.
 *
 * Costs a full build per candidate — a few milliseconds each — and is only
 * called when the diagnostics list is open on a project that has errors.
 */
export function offeredFixes(params: ProjectParams, current: ProjectResult): OfferedFix[] {
  const before = errorsIn(current);
  if (before === 0) return [];

  const out: OfferedFix[] = [];
  for (const candidate of candidates(params)) {
    const next = structuredClone(params);
    candidate.apply(next);
    // A candidate that changes nothing is not a fix, however well it reads.
    if (JSON.stringify(next) === JSON.stringify(params)) continue;

    const built = buildProject(next);
    const after = errorsIn(built);
    if (after >= before) continue;

    out.push({
      ...candidate,
      cost: describeCost(current, built),
      errorsBefore: before,
      errorsAfter: after,
    });
  }
  // Clearing every error beats reducing them, and a cheaper route beats a
  // dearer one: the first entry is the one the panel recommends.
  return out.sort((a, b) => a.errorsAfter - b.errorsAfter || a.label.localeCompare(b.label));
}

function describeCost(before: ProjectResult, after: ProjectResult): string {
  const bits: string[] = [];
  const sheets = sheetsIn(after) - sheetsIn(before);
  if (sheets !== 0) {
    bits.push(
      `${Math.abs(sheets)} ${Math.abs(sheets) === 1 ? 'sheet' : 'sheets'} ${sheets > 0 ? 'more' : 'fewer'}`,
    );
  }
  const y = Math.round((yieldIn(after) - yieldIn(before)) * 100);
  if (Math.abs(y) >= 1) bits.push(`${Math.abs(y)}% ${y > 0 ? 'better' : 'worse'} yield`);
  const warnings =
    after.diagnostics.filter((d) => d.severity === 'warning').length -
    before.diagnostics.filter((d) => d.severity === 'warning').length;
  if (warnings > 0) bits.push(`${warnings} more to check`);
  return bits.join(', ');
}

import type { BayVolume, Part, ProjectParams, ProjectResult } from '@cabgen/core';
import { resolveHardware } from '@cabgen/core';

/**
 * Dragging a panel in the model.
 *
 * Only two things in a cabinet are worth dragging, and they are the two where a
 * millimetre either way is a judgement rather than a number somebody knows: a
 * divider and a fixed shelf. Everything else has a right answer that comes from
 * the material, the hardware or the room, and a slider over it would only be a
 * worse way to type.
 *
 * Dragging is for deciding and typing is for committing, so a drag writes the
 * very parameter the field beside it writes — `bayWidths` for a divider,
 * `shelfGaps` for a shelf — and lands on a number a person would have typed.
 * A drag that stopped at 437.3 mm would be worse than no drag at all.
 */
export type SnapWhy = 'equal' | 'module' | 'round';

export interface Snap {
  at: number;
  why: SnapWhy;
}

/** A round number, for a drag that would otherwise land on 437.3 mm. */
const ROUND_MM = 10;

export interface DragPlan {
  /** The panel being moved. */
  partId: string;
  /** Assembly axis it is free to move along: across the carcass, or up it. */
  axis: 'x' | 'z';
  /** What the drag sets, in mm: the clear opening on the low side of the panel. */
  from: number;
  min: number;
  max: number;
  /** Fixed values worth landing on exactly — the one that makes the pair equal. */
  snaps: Snap[];
  /** The 32 mm module this project is bored to; every multiple of it is a snap. */
  module: number;
  /**
   * What that module is measured from.
   *
   * A bay's opening is its own width, so it is zero. A shelf's is the height of
   * everything already below it: snapping the *gap* to 32 mm would only put the
   * lowest shelf on the ladder, and every one above it a shelf thickness off.
   */
  moduleOffset: number;
  /** What to call the opening being resized, in the words the inspector uses. */
  label: string;
  /** Write the value into the parameters. An ordinary undoable update. */
  commit: (params: ProjectParams, value: number) => void;
}

/** Close enough to a snap that somebody meant to hit it. */
const SNAP_MM = 6;
/**
 * And wider for a named one.
 *
 * Round numbers are ten millimetres apart, so there is always one within five;
 * an equal pair of openings is a single value somewhere between them, and on
 * an equal footing it could never be reached by dragging at all. It is the
 * value people actually want most, so it gets the bigger target.
 */
const NAMED_SNAP_MM = 14;
/** No opening narrower than this, matching the minimum its own field accepts. */
const MIN_OPENING = 20;

/**
 * What dragging this panel would set, or null if it is not something to drag.
 *
 * Everything is resolved from the built project rather than from the
 * parameters, because the parameters may not say: bays with no explicit widths
 * are an even split that only exists once the carcass has been laid out.
 */
export function dragPlanFor(
  project: ProjectResult,
  params: ProjectParams,
  partId: string,
): DragPlan | null {
  const part = project.parts.find((p) => p.id === partId);
  if (!part) return null;
  if (part.role === 'divider') return dividerPlan(project, params, part);
  if (part.role === 'shelf') return shelfPlan(project, params, part);
  return null;
}

/**
 * A divider moves sideways, taking width off one bay and giving it to the
 * other. The rest of the carcass does not move: a drag that resized the box
 * would be a different edit from the one the hand made.
 */
function dividerPlan(
  project: ProjectResult,
  params: ProjectParams,
  divider: Part,
): DragPlan | null {
  const bays = project.bays.filter(
    (b) => b.cabinetId === divider.cabinetId && b.carcassId === divider.carcassId,
  );
  const right = bays.find((b) => b.leftPanelId === divider.id);
  const left = bays.find((b) => b.rightPanelId === divider.id);
  if (!left || !right) return null;

  const widths = bays.map((b) => b.box.max.x - b.box.min.x);
  const pair = widths[left.index]! + widths[right.index]!;
  const module = moduleOf(params);

  return {
    partId: divider.id,
    axis: 'x',
    from: widths[left.index]!,
    min: MIN_OPENING,
    max: pair - MIN_OPENING,
    snaps: [{ at: pair / 2, why: 'equal' }],
    module,
    moduleOffset: 0,
    label: `Bay ${left.index + 1}`,
    commit: (draft, value) => {
      const carcass = carcassIn(draft, divider.cabinetId, divider.carcassId);
      if (!carcass) return;
      // Always seeded from the openings the builder actually produced, never
      // from `bayWidths`: a stored list that does not add up was rejected and
      // is not on screen, and starting from it would leave the new list
      // rejected too — a drag that moved nothing at all.
      const next = [...widths];
      next[left.index] = value;
      // The partner takes the exact remainder rather than a rounded one. The
      // two have to add up to the interior they share; half a millimetre out
      // and every panel beyond them shifts, which is a drag on one divider
      // quietly re-cutting the far end of the box.
      next[right.index] = pair - value;
      carcass.bayWidths = next;
    },
  };
}

/**
 * A fixed shelf moves up and down, taking height off the opening under it and
 * giving it to the one above. An adjustable shelf is not draggable at all — it
 * sits wherever its owner drops it on the pins, and there is no parameter for
 * a drag to write.
 */
function shelfPlan(project: ProjectResult, params: ProjectParams, shelf: Part): DragPlan | null {
  const volume = project.bays.find((b) => b.partIds.includes(shelf.id));
  if (!volume) return null;
  const spec = bayIn(params, volume);
  if (!spec || spec.shelves !== 'fixed') return null;

  const shelves = fixedShelves(project.parts, volume);
  const index = shelves.findIndex((s) => s.id === shelf.id);
  if (index < 0) return null;

  const gaps = gapsOf(shelves, volume);
  const pair = gaps[index]! + gaps[index + 1]!;
  const module = moduleOf(params);

  return {
    partId: shelf.id,
    axis: 'z',
    from: gaps[index]!,
    min: MIN_OPENING,
    max: pair - MIN_OPENING,
    snaps: [{ at: pair / 2, why: 'equal' }],
    // The pin ladder's own pitch, measured the way `pinHeights` measures it —
    // up from the floor of the opening — so a fixed shelf lands exactly where
    // an adjustable one in the same box could have gone.
    module,
    moduleOffset: gaps.slice(0, index).reduce((a, g) => a + g, 0) + index * shelf.thickness,
    label: index === 0 ? 'Under shelf 1' : `Under shelf ${index + 1}`,
    commit: (draft, value) => {
      const target = bayIn(draft, volume);
      if (!target) return;
      // Off the shelves the pipeline actually placed, for the same reason the
      // bay widths are: a stored list that did not add up was never used.
      const next = [...gaps];
      next[index] = value;
      // Exact for the same reason the bay widths are: the shelves above this
      // one must not creep when the one under the hand moves.
      next[index + 1] = pair - value;
      target.shelfGaps = next;
    },
  };
}

/**
 * The value a drag should actually land on.
 *
 * Snapping is what makes the difference between a drag and a slider: the
 * numbers people build to — equal openings, the 32 mm module, a round ten —
 * are the ones a hand cannot hit but a drag can be made to.
 */
export function snapDrag(plan: DragPlan, raw: number): { value: number; why: SnapWhy | null } {
  const wanted = clamp(raw, plan.min, plan.max);
  const reachable = (c: Snap): boolean => c.at >= plan.min && c.at <= plan.max;

  const named = nearest(plan.snaps.filter(reachable), wanted, NAMED_SNAP_MM);
  if (named) return { value: named.at, why: named.why };

  // In this order, so a tie goes to the one that means more: the module the box
  // is bored on, then a round ten.
  const fromModule =
    Math.round((plan.moduleOffset + wanted) / plan.module) * plan.module - plan.moduleOffset;
  const rest = [
    { at: fromModule, why: 'module' as const },
    { at: Math.round(wanted / ROUND_MM) * ROUND_MM, why: 'round' as const },
  ].filter(reachable);
  const best = nearest(rest, wanted, SNAP_MM);
  return best ? { value: best.at, why: best.why } : { value: Math.round(wanted), why: null };
}

/** The closest candidate within `within`, earlier entries winning a tie. */
function nearest(candidates: Snap[], wanted: number, within: number): Snap | null {
  let best: Snap | null = null;
  for (const c of candidates) {
    const d = Math.abs(c.at - wanted);
    if (d <= within && (best === null || d < Math.abs(best.at - wanted))) best = c;
  }
  return best;
}

const WHY: Record<SnapWhy, string> = {
  equal: 'equal openings',
  module: '32 mm system',
  round: 'round number',
};

/** The line shown over the model while a panel is under the hand. */
export function dragReadout(plan: DragPlan, value: number, why: SnapWhy | null): string {
  return `${plan.label} · ${value.toFixed(0)} mm${why ? ` · ${WHY[why]}` : ''}`;
}

/** The fixed shelves standing in a bay, lowest first. */
export function fixedShelves(parts: Part[], volume: BayVolume): Part[] {
  const inside = new Set(volume.partIds);
  return parts
    .filter((p) => p.role === 'shelf' && inside.has(p.id) && !p.id.includes('-SHELF-ADJ-'))
    .sort((a, b) => a.box.min.z - b.box.min.z);
}

/**
 * Clear height under each fixed shelf, and above the top one.
 *
 * Read off the shelves the pipeline actually placed rather than recomputed, so
 * a list seeded from here is the stack that is on screen.
 */
export function gapsOf(shelves: Part[], volume: BayVolume): number[] {
  const gaps: number[] = [];
  let z = volume.shelfRun.z0;
  for (const shelf of shelves) {
    gaps.push(shelf.box.min.z - z);
    z = shelf.box.max.z;
  }
  gaps.push(volume.shelfRun.z1 - z);
  return gaps;
}

/** The 32 mm module this project is actually bored to, not a remembered 32. */
function moduleOf(params: ProjectParams): number {
  const pitch = resolveHardware(params.hardware).shelfPin.boring.pitch;
  return pitch > 0 ? pitch : 32;
}

function carcassIn(params: ProjectParams, cabinetId: string, carcassId: string) {
  return params.cabinets.find((c) => c.id === cabinetId)?.carcasses.find((k) => k.id === carcassId);
}

function bayIn(params: ProjectParams, volume: BayVolume) {
  return carcassIn(params, volume.cabinetId, volume.carcassId)?.bays[volume.index];
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

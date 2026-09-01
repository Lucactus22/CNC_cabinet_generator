import type { Carcass, ProjectParams, ProjectResult } from '@cabgen/core';
import type { Selection } from '../selection';

/**
 * Capabilities offered where they plainly apply.
 *
 * The third of docs/UX.md's three discovery routes, and the only one that
 * reaches somebody who was not looking: find-by-name needs the word, a gallery
 * needs you to have opened the section it sits in, and this needs nothing.
 *
 * It is also, as R-19 says in its own item, **the part most likely to be done
 * badly**, so the bar is written into the shape of the data rather than left
 * to whoever writes the next one:
 *
 * - One line, in the voice of a diagnostic: something a woodworker would say.
 * - Tied to what is selected, so it is about the thing being worked on.
 * - Never a modal, never animated, never more than one at a time.
 * - Shown once per browser, then gone whatever became of it.
 *
 * The component adds the timing rules — nothing appears while the model is
 * rebuilding, while an option is being considered, over an open drawer, or
 * until the selection has sat still for a moment. See `Suggestion.tsx`.
 */

export interface SuggestionContext {
  params: ProjectParams;
  project: ProjectResult;
  selection: Selection;
}

export interface Suggestion {
  id: string;
  /** One sentence. Says what could be done, never tells anybody to do it. */
  says: string;
  /** The capability it points at, so "what is that?" has an answer. */
  topicId: string;
  /** The control it would take you to — a path in `catalog.ts`. */
  param: string;
  applies: (ctx: SuggestionContext) => boolean;
}

const carcassOf = (ctx: SuggestionContext): Carcass | undefined => {
  const sel = ctx.selection;
  if (sel.kind !== 'carcass' && sel.kind !== 'bay') return undefined;
  return ctx.params.cabinets
    .find((c) => c.id === sel.cabinetId)
    ?.carcasses.find((k) => k.id === sel.carcassId);
};

/** Whether the selected carcass is the one actually standing on the ground. */
const onTheFloor = (ctx: SuggestionContext): boolean => {
  const sel = ctx.selection;
  if (sel.kind !== 'carcass') return false;
  const cabinet = ctx.params.cabinets.find((c) => c.id === sel.cabinetId);
  return cabinet?.carcasses[0]?.id === sel.carcassId;
};

export const SUGGESTIONS: Suggestion[] = [
  {
    id: 'toe-kick',
    says: 'This box stands flat on the floor. A toe kick notches the bottom front corners back and houses a rail behind them, so your feet fit under it at the sink.',
    topicId: 'toe-kick',
    param: 'cabinets[].carcasses[].toeKick.enabled',
    applies: (ctx) => {
      const carcass = carcassOf(ctx);
      return (
        ctx.selection.kind === 'carcass' &&
        onTheFloor(ctx) &&
        carcass !== undefined &&
        !carcass.toeKick.enabled &&
        carcass.height >= 600
      );
    },
  },
  {
    id: 'knock-down',
    says: 'These boxes are screwed together. They can also be cut to knock together — tabs through the sides, no fasteners at all — if you do not mind the joint showing.',
    topicId: 'tab-and-slot',
    param: 'joinery.carcassJoint',
    applies: (ctx) =>
      ctx.selection.kind === 'carcass' &&
      ctx.params.joinery.carcassJoint === 'dado' &&
      ctx.params.joinery.screwHoles,
  },
  {
    id: 'adjustable-shelves',
    says: 'These shelves are housed in dados, so they stiffen the box and never move. Bored for pins instead, a loose shelf goes where whatever it is holding needs it.',
    topicId: 'shelf-pins',
    param: 'cabinets[].carcasses[].bays[].shelves',
    applies: (ctx) => {
      const sel = ctx.selection;
      if (sel.kind !== 'bay') return false;
      return carcassOf(ctx)?.bays[sel.bay]?.shelves === 'fixed';
    },
  },
  {
    id: 'plain-front',
    says: 'Nothing is cut into this face. A shaker line or a run of beadboard is machined on the same setup as the blank, before it ever leaves the bed.',
    topicId: 'surface-frame',
    param: 'surfaceEffects',
    applies: (ctx) => {
      const sel = ctx.selection;
      if (sel.kind !== 'part') return false;
      const part = ctx.project.parts.find((p) => p.id === sel.partId);
      if (!part || (part.role !== 'door' && part.role !== 'drawer-face')) return false;
      return !part.features.some((f) => f.kind !== 'engrave' && f.purpose.startsWith('surface-'));
    },
  },
  {
    id: 'front-banding',
    says: 'The edges of a front are the ones people see and touch. Say which get tape and the blank is cut short by its thickness, so the door still fits its reveal afterwards.',
    topicId: 'edge-banding',
    param: 'edgeBanding[].edges',
    applies: (ctx) => {
      const sel = ctx.selection;
      if (sel.kind !== 'part') return false;
      const part = ctx.project.parts.find((p) => p.id === sel.partId);
      if (!part || (part.role !== 'door' && part.role !== 'drawer-face')) return false;
      return part.bandedEdges.length === 0 && ctx.params.bandingMaterials.length > 0;
    },
  },
  {
    id: 'measure-the-room',
    says: 'This run is being built to the numbers you typed. If it has to go into a real alcove, measure the opening and the ends get scribe strips cut to fit the walls.',
    topicId: 'scribe',
    param: 'opening.enabled',
    applies: (ctx) => ctx.selection.kind === 'run' && !ctx.params.opening.enabled,
  },
];

/**
 * The one suggestion to offer, if any.
 *
 * First applicable and unseen wins, in the order above, which is roughly the
 * order somebody meets these things: the box, then the joint, then what goes
 * in it, then the fronts, then the room.
 */
export function suggestionFor(ctx: SuggestionContext, seen: string[]): Suggestion | null {
  return SUGGESTIONS.find((s) => !seen.includes(s.id) && s.applies(ctx)) ?? null;
}

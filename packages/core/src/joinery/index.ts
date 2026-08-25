import { bboxOf, buildOutline, relieveCorners } from '../geom/index.js';
import type {
  Assembly,
  CabinetParams,
  DrillFeature,
  EngraveFeature,
  Feature,
  Part,
  PocketFeature,
} from '../model/types.js';
import {
  buildParts,
  type BuildResult,
  type PinRowRequest,
  type ToeNotchRequest,
} from '../build/builder.js';
import { applyEffects } from '../effects/index.js';
import { applyHinges } from '../hardware/hinges.js';
import { applyDado } from './dado.js';
import { applyTabSlot } from './tabslot.js';
import {
  centerOf,
  cornerBetween,
  edgeFacing,
  FRONT_DIR,
  isVerticalEdge,
  makeDraft,
  mapAxis,
  refreshBase,
  type PartDraft,
} from './helpers.js';

export * from './helpers.js';
export { applyDado } from './dado.js';
export { applyTabSlot, planTabs } from './tabslot.js';

export interface JoineryResult extends Assembly {
  warnings: string[];
  notes: string[];
}

/**
 * Turn a set of parameters into finished, machinable parts.
 *
 * The builder decides what meets what; this stage decides what that looks like
 * in the material, then materialises each blank's outline once every joint that
 * touches it has had its say.
 */
export function generate(params: CabinetParams): JoineryResult {
  const built = buildParts(params);
  const warnings = applyJoinery(params, built);
  // Effects run last: they need the finished blank and the region of it that
  // stays visible, and they only ever add features on top.
  warnings.push(...applyEffects(params, built.parts).warnings);
  return { params, parts: built.parts, warnings, notes: built.notes };
}

export function applyJoinery(params: CabinetParams, built: BuildResult): string[] {
  const warnings: string[] = [];
  const drafts = new Map<string, PartDraft>();
  for (const part of built.parts) drafts.set(part.id, makeDraft(part));

  for (const req of built.joints) {
    const male = drafts.get(req.maleId);
    const female = drafts.get(req.femaleId);
    if (!male || !female) {
      warnings.push(`Joint references a missing panel (${req.maleId} into ${req.femaleId}).`);
      continue;
    }
    const useTabs = params.joinery.carcassJoint === 'tabslot' && !req.forceDado;
    const outcome = useTabs
      ? applyTabSlot(male, female, req, params)
      : applyDado(male, female, req, params);
    warnings.push(...outcome.warnings);
  }

  for (const row of built.pinRows) {
    const draft = drafts.get(row.panelId);
    if (draft) applyPinRow(draft, row, params, warnings);
  }

  warnings.push(...applyHinges(params, built.parts, built.hinges).warnings);

  for (const notch of built.toeNotches) {
    const draft = drafts.get(notch.panelId);
    if (draft) applyToeNotch(draft, notch);
  }

  for (const draft of drafts.values()) materialise(draft, params);
  return warnings;
}

/** Shelf pin ladder, drilled on whichever face looks into the bay. */
function applyPinRow(
  draft: PartDraft,
  row: PinRowRequest,
  params: CabinetParams,
  warnings: string[],
): void {
  const pin = params.joinery.shelfPin;
  const part = draft.part;
  const centre = centerOf(part.box);
  // Face A points along +normal when faceASign is '+', so compare the bay's
  // side of the panel with the side face A looks out on.
  const bayIsHigh = row.bayCentreX > centre.x;
  const side: 'A' | 'B' = (part.faceASign === '+') === bayIsHigh ? 'A' : 'B';

  if (pin.depth >= part.thickness) {
    warnings.push(
      `${part.label}: ${pin.depth} mm shelf pin holes would break through a ${part.thickness.toFixed(1)} mm panel.`,
    );
  }

  const zMap = mapAxis(draft.frame, 'z');
  const yMap = mapAxis(draft.frame, 'y');
  if (!zMap || !yMap) return;

  for (const h of row.heights) {
    for (const y of row.ys) {
      const local = toLocalXY(draft, y, h);
      const hole: DrillFeature = {
        kind: 'drill',
        x: local.x,
        y: local.y,
        diameter: pin.diameter,
        depth: pin.depth,
        side,
        purpose: 'shelf-pin',
      };
      part.features.push(hole);
    }
  }
}

function toLocalXY(
  draft: PartDraft,
  assemblyY: number,
  assemblyZ: number,
): { x: number; y: number } {
  const o = draft.frame.origin;
  const p = { x: o.x, y: assemblyY, z: assemblyZ };
  const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
  const f = draft.frame;
  return {
    x: d.x * f.u.x + d.y * f.u.y + d.z * f.u.z,
    y: d.x * f.v.x + d.y * f.v.y + d.z * f.v.z,
  };
}

/**
 * Build the final outline once every joint has contributed its notches and
 * tabs, then record the blank size the nester and cut list will work from.
 */
function materialise(draft: PartDraft, params: CabinetParams): void {
  refreshBase(draft);
  const { base, notches, tabs } = draft;

  let outline = buildOutline({
    x0: base.x,
    y0: base.y,
    w: base.w,
    h: base.h,
    notches,
    tabs,
  });

  // A tab leaves an inside corner at its root. Left alone the cutter's radius
  // holds the shoulder off the mating face, so those corners get relieved too.
  if (tabs.length > 0) {
    outline = relieveCorners(outline, {
      toolRadius: params.tool.diameter / 2,
      style: params.joinery.reliefStyle,
      corners: 'concave',
    });
  }

  draft.part.outline = outline;
  draft.part.exposed = draft.exposed;
  const bb = bboxOf(outline);
  draft.part.width = bb.maxX - bb.minX;
  draft.part.height = bb.maxY - bb.minY;

  if (params.labelParts) {
    // Put the label on whichever face is already being worked, so it never
    // becomes the reason a panel gets turned over.
    const machined = draft.part.features.find(forcesFace);
    const label: EngraveFeature = {
      kind: 'engrave',
      x: bb.minX + 12,
      y: bb.minY + 12,
      text: draft.part.id,
      height: 8,
      side: machined?.side ?? 'A',
    };
    draft.part.features.push(label);
  }
}

/** Cut the toe kick out of a side panel's front bottom corner. */
function applyToeNotch(draft: PartDraft, req: ToeNotchRequest): void {
  const front = edgeFacing(draft.frame, FRONT_DIR);
  const bottom = edgeFacing(draft.frame, { x: 0, y: 0, z: -1 });
  if (!front || !bottom || isVerticalEdge(front) === isVerticalEdge(bottom)) return;
  const corner = cornerBetween(front, bottom);
  if (!corner) return;

  // The horizontal local axis is whichever of the two edges is vertical.
  const dx = isVerticalEdge(front) ? req.setback : req.height;
  const dy = isVerticalEdge(front) ? req.height : req.setback;
  const existing = draft.notches.find((n) => n.corner === corner);
  if (existing) {
    existing.dx = Math.max(existing.dx, dx);
    existing.dy = Math.max(existing.dy, dy);
  } else {
    draft.notches.push({ corner, dx, dy });
  }
}

/**
 * Whether a feature actually pins a panel to one face.
 *
 * A through cut goes right through, so it can be made from either side. An
 * engraved label is a reference marking that can go wherever the panel is
 * already being machined, so neither forces the panel to be turned over.
 */
export function forcesFace(f: Feature): f is PocketFeature | DrillFeature {
  if (f.kind === 'through') return false;
  if (f.kind === 'engrave') return false;
  if (f.kind === 'drill' && f.depth === 'thru') return false;
  return true;
}

/** Panels that need work on both faces, which means flipping them on the bed. */
export function partsNeedingFlip(parts: Part[]): Part[] {
  return parts.filter((p) => {
    let a = false;
    let b = false;
    for (const f of p.features) {
      if (!forcesFace(f)) continue;
      if (f.side === 'A') a = true;
      else b = true;
    }
    return a && b;
  });
}

import { bboxOf, buildOutline, relieveCorners } from '../geom/index.js';
import type {
  Assembly,
  ProjectParams,
  DrillFeature,
  EngraveFeature,
  Feature,
  Part,
  PocketFeature,
} from '../model/types.js';
import { toLocal } from '../model/frame.js';
import {
  buildParts,
  type BuildResult,
  type DrawerBottomNotchRequest,
  type HandleRequest,
  type HingeRequest,
  type JointRequest,
  type PinRowRequest,
  type SlideRequest,
  type TaperRequest,
  type ToeNotchRequest,
  type WallMountRequest,
} from '../build/builder.js';
import { applyEffects } from '../effects/index.js';
import { resolveHardware, type ShelfPinBoring } from '../hardware/catalogue.js';
import { applyHandles } from '../hardware/handles.js';
import { applyHinges } from '../hardware/hinges.js';
import { applySlides } from '../hardware/slides.js';
import { applyBanding } from './banding.js';
import { applyDado } from './dado.js';
import { applyHalfLap } from './halflap.js';
import { applyTabSlot } from './tabslot.js';
import {
  centerOf,
  cornerBetween,
  edgeFacing,
  FRONT_DIR,
  isVerticalEdge,
  LEFT_DIR,
  makeDraft,
  mapAxis,
  REAR_DIR,
  refreshBase,
  RIGHT_DIR,
  type PartDraft,
} from './helpers.js';

export * from './helpers.js';
export { applyBanding } from './banding.js';
export { applyDado } from './dado.js';
export { applyHalfLap } from './halflap.js';
export { applyTabSlot, planTabs } from './tabslot.js';

export interface JoineryResult extends Assembly {
  warnings: string[];
  notes: string[];
  /**
   * What meets what, exactly as the builder decided it — kept around after
   * joinery has consumed it so a later stage can derive an assembly order from
   * it (R-10) without re-deriving what the builder already knows. See
   * `export/assembly.ts`.
   */
  joints: JointRequest[];
  hinges: HingeRequest[];
  handles: HandleRequest[];
  slides: SlideRequest[];
  wallMounts: WallMountRequest[];
}

/**
 * Turn a set of parameters into finished, machinable parts.
 *
 * The builder decides what meets what; this stage decides what that looks like
 * in the material, then materialises each blank's outline once every joint that
 * touches it has had its say.
 */
export function generate(params: ProjectParams): JoineryResult {
  const built = buildParts(params);
  const warnings = applyJoinery(params, built);
  // Effects run last: they need the finished blank and the region of it that
  // stays visible, and they only ever add features on top.
  warnings.push(...applyEffects(params, built.parts).warnings);
  return {
    params,
    parts: built.parts,
    warnings,
    notes: built.notes,
    joints: built.joints,
    hinges: built.hinges,
    handles: built.handles,
    slides: built.slides,
    wallMounts: built.wallMounts,
  };
}

export function applyJoinery(params: ProjectParams, built: BuildResult): string[] {
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
    // A face frame's stiles and rails cross in one plane rather than meeting
    // edge to face, so neither the housing joint nor the tab-and-slot one
    // applies to them regardless of what the carcass joint is set to.
    const useTabs = params.joinery.carcassJoint === 'tabslot' && !req.forceDado;
    const outcome =
      req.purpose === 'face-frame'
        ? applyHalfLap(male, female, params)
        : useTabs
          ? applyTabSlot(male, female, req, params)
          : applyDado(male, female, req, params);
    warnings.push(...outcome.warnings);
  }

  const hw = resolveHardware(params.hardware);

  for (const row of built.pinRows) {
    const draft = drafts.get(row.panelId);
    if (draft) applyPinRow(draft, row, hw.shelfPin.boring);
  }

  warnings.push(...applyHinges(hw.hinge, built.parts, built.hinges).warnings);
  if (hw.handle) {
    warnings.push(...applyHandles(hw.handle, hw.placement, built.parts, built.handles).warnings);
  }
  warnings.push(...applySlides(hw.slide, built.parts, built.slides).warnings);

  for (const notch of built.toeNotches) {
    const draft = drafts.get(notch.panelId);
    if (draft) applyToeNotch(draft, notch);
  }

  for (const notch of built.drawerNotches) {
    const draft = drafts.get(notch.panelId);
    if (draft) applyDrawerBottomNotch(draft, notch);
  }

  for (const mount of built.wallMounts) {
    const draft = drafts.get(mount.panelId);
    if (draft) applyWallMountHoles(draft, mount);
  }

  for (const req of built.tapers) {
    const draft = drafts.get(req.partId);
    if (draft) applyTaper(draft, req, warnings);
  }

  // Shared across every part so a role that is banded on an edge it never has
  // — or a banding material missing from the list — is reported once, not
  // once per panel of that role.
  const warnedRoleEdges = new Set<string>();
  for (const draft of drafts.values()) materialise(draft, params, warnings, warnedRoleEdges);
  return warnings;
}

/** Shelf pin ladder, drilled on whichever face looks into the bay. */
function applyPinRow(draft: PartDraft, row: PinRowRequest, pin: ShelfPinBoring): void {
  const part = draft.part;
  const centre = centerOf(part.box);
  // Face A points along +normal when faceASign is '+', so compare the bay's
  // side of the panel with the side face A looks out on.
  const bayIsHigh = row.bayCentreX > centre.x;
  const side: 'A' | 'B' = (part.faceASign === '+') === bayIsHigh ? 'A' : 'B';

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
 * Cut one vertical edge of a blank back at one end, so it follows a leaning wall.
 *
 * Resolved here, against the part's own frame, rather than in the builder:
 * which local edge faces the wall depends on the panel's handedness, and
 * guessing it is how a filler comes back mirrored and tapering the wrong way.
 */
function applyTaper(draft: PartDraft, req: TaperRequest, warnings: string[]): void {
  const edge = edgeFacing(draft.frame, req.edgeFacing);
  const end = edgeFacing(draft.frame, req.narrowEnd);
  if (!edge || !end || !isVerticalEdge(edge) || isVerticalEdge(end)) {
    warnings.push(
      `${draft.part.label}: the taper does not lie along either axis of the blank, so it was left square.`,
    );
    return;
  }
  draft.taper = { edge, at: end, by: req.by };
  // Only the rectangle that fits inside the trapezoid at every height is
  // really on show, so a groove effect cannot run off the sloping edge at the
  // narrow end.
  if (edge === 'left') draft.exposed.x += req.by;
  draft.exposed.w -= req.by;
}

/**
 * Build the final outline once every joint has contributed its notches and
 * tabs, then record the blank size the nester and cut list will work from.
 */
function materialise(
  draft: PartDraft,
  params: ProjectParams,
  warnings: string[],
  warnedRoleEdges: Set<string>,
): void {
  refreshBase(draft);
  // Shrinks `base` on any banded edge before the outline is built from it, so
  // the blank the nester and cut list see is already the size the router
  // actually cuts.
  applyBanding(draft, params, warnings, warnedRoleEdges);
  const { base, notches, tabs, taper } = draft;

  let outline = buildOutline({
    x0: base.x,
    y0: base.y,
    w: base.w,
    h: base.h,
    notches,
    tabs,
    taper,
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
    // A tapered blank has no material at the corner of its bounding box on the
    // sloping side, so the label is anchored to the rectangle that is inside
    // the part at every height. Engraved into thin air it would be cut across
    // the neighbouring part on the sheet.
    const anchor = taper ? draft.exposed : { x: bb.minX, y: bb.minY };
    const label: EngraveFeature = {
      kind: 'engrave',
      x: anchor.x + 12,
      y: anchor.y + 12,
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
 * Notch each rear corner of a drawer box's bottom, clearing the slide's
 * locking device — the same corner-notch machinery a toe kick uses, just at
 * the two rear corners of a horizontal panel instead of the two front-bottom
 * corners of a vertical one.
 */
function applyDrawerBottomNotch(draft: PartDraft, req: DrawerBottomNotchRequest): void {
  const rear = edgeFacing(draft.frame, REAR_DIR);
  if (!rear) return;
  for (const sideDir of [LEFT_DIR, RIGHT_DIR]) {
    const side = edgeFacing(draft.frame, sideDir);
    if (!side || isVerticalEdge(rear) === isVerticalEdge(side)) continue;
    const corner = cornerBetween(rear, side);
    if (!corner) continue;

    const dx = isVerticalEdge(rear) ? req.depth : req.width;
    const dy = isVerticalEdge(rear) ? req.width : req.depth;
    const existing = draft.notches.find((n) => n.corner === corner);
    if (existing) {
      existing.dx = Math.max(existing.dx, dx);
      existing.dy = Math.max(existing.dy, dy);
    } else {
      draft.notches.push({ corner, dx, dy });
    }
  }
}

/**
 * Clearance holes through a hanging rail, for the screws that hang the
 * cabinet on the wall.
 *
 * A through hole, drilled the same regardless of which face it is read from,
 * so unlike a joint's assembly screws this never forces the panel onto a
 * second face.
 */
function applyWallMountHoles(draft: PartDraft, req: WallMountRequest): void {
  for (const x of req.xs) {
    const local = toLocal(draft.frame, { x, y: draft.frame.origin.y, z: req.z });
    const hole: DrillFeature = {
      kind: 'drill',
      x: local.x,
      y: local.y,
      diameter: req.diameter,
      depth: 'thru',
      side: 'A',
      purpose: 'wall-mount',
    };
    draft.part.features.push(hole);
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

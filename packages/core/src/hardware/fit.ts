import type { DrillFeature, Part, ProjectParams } from '../model/types.js';
import {
  CATALOGUE,
  KIND_LABELS,
  resolveHardware,
  type HandleEntry,
  type HardwareEntry,
  type HardwareKind,
  type HardwareMeasure,
  type HingeEntry,
  type Requirement,
  type ShelfPinEntry,
} from './catalogue.js';

export interface HardwareProblem {
  severity: 'error' | 'warning' | 'info';
  message: string;
  partIds?: string[];
  hint?: string;
}

const TOL = 1e-6;

/**
 * Which machining tells you a piece of hardware is actually fitted here.
 *
 * The checks work from the holes that were cut rather than from what the
 * builder intended, so a requirement can only fire against a panel the hardware
 * really lands on. It also means a new kind of hardware is checked as soon as
 * it bores something, with no second list to keep in step.
 */
const CARRIES: Record<HardwareKind, { door: string | null; panel: string | null }> = {
  hinge: { door: 'hinge-cup', panel: 'hinge-plate' },
  'shelf-pin': { door: null, panel: 'shelf-pin' },
  handle: { door: 'handle', panel: null },
};

/** The dimension a requirement is about, and which set of panels carries it. */
const MEASURES: Record<
  HardwareMeasure,
  { on: 'door' | 'panel'; of: (p: Part) => number; noun: string }
> = {
  'door thickness': { on: 'door', of: (p) => p.thickness, noun: 'thick' },
  'door width': { on: 'door', of: (p) => p.box.max.x - p.box.min.x, noun: 'wide' },
  'door height': { on: 'door', of: (p) => p.box.max.z - p.box.min.z, noun: 'tall' },
  'carcass panel thickness': { on: 'panel', of: (p) => p.thickness, noun: 'thick' },
};

/**
 * The measures a kind of hardware can actually be checked against.
 *
 * Decided by what it bores into: a shelf pin never touches a door, so a rule
 * about door thickness on one can never fire — and a rule that can never fire
 * is worse than no rule, because it reads on screen as a guard that is in
 * place. The panel offers only these, and `requirements` says so out loud if a
 * project file carries one anyway.
 */
export function measuresFor(kind: HardwareKind): HardwareMeasure[] {
  return (Object.keys(MEASURES) as HardwareMeasure[]).filter(
    (m) => CARRIES[kind][MEASURES[m].on] !== null,
  );
}

/**
 * Everything the selected hardware has to say about the job it has been put on.
 *
 * Two different things are checked here and both matter. A **requirement** is
 * the maker's published limit — a hinge that needs a door at least 16 mm thick
 * — and breaking it gives a warning, because the holes can be cut and the
 * hardware simply will not work. A **derived** check is arithmetic on the
 * boring pattern itself — a 13 mm cup in an 11.9 mm door — and breaking that is
 * an error, because the panel is ruined.
 */
export function checkHardware(params: ProjectParams, parts: Part[]): HardwareProblem[] {
  const out: HardwareProblem[] = [];
  const hw = resolveHardware(params.hardware);

  for (const gone of hw.missing) {
    out.push({
      severity: 'warning',
      message: `This project asks for a ${KIND_LABELS[gone.kind].toLowerCase()} called "${gone.id}", which is not in the catalogue or in the project's own entries. ${gone.outcome}`,
      hint: `Pick a ${KIND_LABELS[gone.kind].toLowerCase()} from the list, or add the missing entry to this project.`,
    });
  }

  const chosen = new Set(
    [params.hardware.hingeId, params.hardware.shelfPinId, params.hardware.handleId].filter(Boolean),
  );
  for (const own of params.hardware.custom) {
    // Only for an id the project is actually cut to: saying "the project's own
    // entry is the one being cut" about an entry nobody selected is a
    // diagnostic that states the wrong thing loudly.
    if (chosen.has(own.id) && CATALOGUE.some((e) => e.id === own.id && e.kind === own.kind)) {
      out.push({
        severity: 'warning',
        // Silently preferring the built-in would cut someone else's numbers;
        // silently preferring the project's would look like the built-in.
        message: `This project has its own ${KIND_LABELS[own.kind].toLowerCase()} called "${own.id}", which is also the id of a built-in. The project's own entry is the one being cut.`,
        hint: 'Give the custom entry an id of its own.',
      });
    }
  }

  requirements(hw.hinge, parts, out);
  requirements(hw.shelfPin, parts, out);
  if (hw.handle) requirements(hw.handle, parts, out);

  hingeChecks(hw.hinge, parts, out);
  shelfPinChecks(hw.shelfPin, parts, out);
  if (hw.handle) handleChecks(hw.handle, params, parts, out);

  return out;
}

/** Panels a piece of hardware is actually fitted to, by the holes it left. */
function carriers(entry: HardwareEntry, parts: Part[], on: 'door' | 'panel'): Part[] {
  const purpose = CARRIES[entry.kind][on];
  if (!purpose) return [];
  // An engraved label has no purpose field, so ask before reading it.
  return parts.filter((p) => p.features.some((f) => 'purpose' in f && f.purpose === purpose));
}

/** The maker's published limits, checked against every panel it was fitted to. */
function requirements(entry: HardwareEntry, parts: Part[], out: HardwareProblem[]): void {
  for (const req of entry.requires) {
    const m = MEASURES[req.measure];
    const kindLabel = KIND_LABELS[entry.kind].toLowerCase();
    if (!m || CARRIES[entry.kind][m.on] === null) {
      out.push({
        severity: 'warning',
        message: `A rule on ${entry.name} is about ${req.measure}, which a ${kindLabel} is never fitted to, so nothing is ever checked against it.`,
        hint: 'Give the rule a measure this hardware is bored into, or remove it.',
      });
      continue;
    }
    if (req.min === undefined && req.max === undefined) {
      out.push({
        severity: 'warning',
        message: `A rule on ${entry.name} about ${req.measure} has neither a minimum nor a maximum, so there is nothing for it to check.`,
        hint: 'Set a limit on the rule, or remove it.',
      });
      continue;
    }
    for (const part of carriers(entry, parts, m.on)) {
      const value = m.of(part);
      const under = req.min !== undefined && value < req.min - TOL;
      const over = req.max !== undefined && value > req.max + TOL;
      if (!under && !over) continue;
      const limit = under ? req.min! : req.max!;
      out.push({
        severity: 'warning',
        message: `${part.label} is ${value.toFixed(1)} mm ${m.noun}, but ${entry.name} needs ${under ? 'at least' : 'no more than'} ${limit} mm: ${req.why}.`,
        partIds: [part.id],
        hint: fixFor(req, entry),
      });
    }
  }
}

function fixFor(req: Requirement, entry: HardwareEntry): string {
  if (req.measure === 'door thickness') {
    return `Change the door material, or pick a ${KIND_LABELS[entry.kind].toLowerCase()} made for it.`;
  }
  if (req.measure === 'carcass panel thickness') {
    return `Change the carcass material, or pick a ${KIND_LABELS[entry.kind].toLowerCase()} with a shallower hole.`;
  }
  return `Resize the door, or pick a ${KIND_LABELS[entry.kind].toLowerCase()} that suits it.`;
}

/** What the hinge's own boring pattern does to the material it is cut into. */
function hingeChecks(entry: HingeEntry, parts: Part[], out: HardwareProblem[]): void {
  const h = entry.boring;

  for (const door of carriers(entry, parts, 'door')) {
    if (h.cupDepth >= door.thickness - TOL) {
      out.push({
        severity: 'error',
        message: `${door.label}: a ${h.cupDepth} mm hinge cup goes straight through ${door.thickness.toFixed(1)} mm material.`,
        partIds: [door.id],
        hint: 'Use a thicker door, or a hinge with a shallower cup.',
      });
    } else if (door.thickness - h.cupDepth < 3) {
      out.push({
        severity: 'warning',
        message: `${door.label}: a ${h.cupDepth} mm cup leaves only ${(door.thickness - h.cupDepth).toFixed(1)} mm behind it in ${door.thickness.toFixed(1)} mm material.`,
        partIds: [door.id],
        hint: 'Use a thicker door, or a hinge with a shallower cup.',
      });
    }
  }

  const { min, max } = entry.boringDistanceRange;
  const bored = carriers(entry, parts, 'door').length > 0;
  if (bored && (h.boringDistance < min - TOL || h.boringDistance > max + TOL)) {
    out.push({
      severity: 'warning',
      // Outside its own range the arm cannot reach its mounting plate, so the
      // door will not shut however well the cup is bored.
      message: `A boring distance of ${h.boringDistance} mm is outside the ${min}-${max} mm ${entry.name} is made for.`,
      hint: `Set the boring distance between ${min} and ${max} mm.`,
    });
  }

  for (const panel of carriers(entry, parts, 'panel')) {
    if (h.plateHoleDepth >= panel.thickness - TOL) {
      out.push({
        severity: 'error',
        message: `${panel.label}: ${h.plateHoleDepth} mm mounting plate holes would break through ${panel.thickness.toFixed(1)} mm material and show on the outside of the cabinet.`,
        partIds: [panel.id],
        hint: 'Use a thicker carcass material, or a hinge with shorter plate screws.',
      });
    }
  }
}

function shelfPinChecks(entry: ShelfPinEntry, parts: Part[], out: HardwareProblem[]): void {
  for (const panel of carriers(entry, parts, 'panel')) {
    if (entry.boring.depth >= panel.thickness - TOL) {
      out.push({
        severity: 'error',
        message: `${panel.label}: ${entry.boring.depth} mm shelf pin holes would break through ${panel.thickness.toFixed(1)} mm material.`,
        partIds: [panel.id],
        hint: 'Use a thicker carcass material, or a shelf pin with a shorter peg.',
      });
    }
  }
}

/**
 * Whether the handle lands on the door, and where.
 *
 * Worked from the holes that were actually emitted, in the blank's own
 * coordinates, so it catches a placement that walks the screws off the edge
 * whichever way round the door was built.
 */
function handleChecks(
  entry: HandleEntry,
  params: ProjectParams,
  parts: Part[],
  out: HardwareProblem[],
): void {
  const b = entry.boring;
  const r = b.screwDiameter / 2;
  let bored = 0;

  if (b.style === 'bar' && b.centres <= TOL) {
    // Only one hole is drilled, because the second would be on top of it. The
    // door comes off the machine with one hole and a two-screw handle to fix
    // to it, and no other check would notice.
    out.push({
      severity: 'error',
      message: `${entry.name} is a bar handle with no fixing centres, so only one of its two screw holes can be drilled.`,
      hint: 'Set the fixing centres, or change the style to a knob.',
    });
  }

  for (const door of parts) {
    const screws = door.features.filter(
      (f): f is DrillFeature => f.kind === 'drill' && f.purpose === 'handle',
    );
    if (screws.length === 0) continue;
    bored++;

    const off = screws.some(
      (s) =>
        s.x - r < -TOL ||
        s.x + r > door.width + TOL ||
        s.y - r < -TOL ||
        s.y + r > door.height + TOL,
    );
    if (off) {
      out.push({
        severity: 'error',
        message: `${door.label}: a ${entry.name} placed this way puts a fixing hole off the edge of the blank.`,
        partIds: [door.id],
        hint: 'Reduce the handle offsets, or fit a smaller handle.',
      });
      continue;
    }

    const overhang = overhangOf(screws, entry, door);
    if (overhang > TOL) {
      out.push({
        severity: 'warning',
        message: `${door.label}: the ends of a ${entry.name} stand ${overhang.toFixed(1)} mm past the edge of the door. The holes are right, the handle is not.`,
        partIds: [door.id],
        hint: 'Move the handle further from the door end, or fit a shorter handle.',
      });
    }
  }

  if (bored > 0) {
    const p = params.hardware.handlePlacement;
    const where =
      p.from === 'centre'
        ? 'centred on the door'
        : `${p.endOffset} mm from the ${p.from} of the door`;
    out.push({
      severity: 'info',
      // These are holes through the front of a finished door, so the numbers
      // are worth reading back before the file goes to the machine.
      message: `${bored} ${bored === 1 ? 'door is' : 'doors are'} drilled for a ${entry.name}, ${p.orientation}, ${where}${p.orientation === 'vertical' ? `, ${p.edgeOffset} mm in from the opening edge` : ''}.`,
    });
  }
}

/** How far the handle's body stands past the blank, beyond its fixing holes. */
function overhangOf(screws: DrillFeature[], entry: HandleEntry, door: Part): number {
  const b = entry.boring;
  if (b.style === 'knob') {
    const half = b.length / 2;
    return Math.max(
      0,
      ...screws.map((s) =>
        Math.max(half - s.x, s.x + half - door.width, half - s.y, s.y + half - door.height),
      ),
    );
  }
  if (screws.length < 2) return 0;

  // A bar is slim across its length, so only the axis it runs along can hang
  // off. Which local axis that is comes from the holes themselves.
  const spreadX = Math.abs(screws[0]!.x - screws[1]!.x);
  const spreadY = Math.abs(screws[0]!.y - screws[1]!.y);
  const alongV = spreadY >= spreadX;
  const values = screws.map((s) => (alongV ? s.y : s.x));
  const extent = alongV ? door.height : door.width;
  const beyond = (b.length - b.centres) / 2;
  return Math.max(0, beyond - Math.min(...values), Math.max(...values) + beyond - extent);
}
